'use server';

import { revalidateTag } from 'next/cache';
import { getGoogleAccessToken } from '@/lib/googleAuth';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { WebsiteEditsBlock, WebsiteEditsRun, WebsiteEditsTab } from '@/type/websiteEdits';

const DOC_CACHE_TAG = 'website-edits-doc';

// "Website Edits" doc — one tab per client site, each holding free-form edit
// requests (text + embedded images). Uses the Docs API (not Drive's flat
// export) specifically because tabs are a Docs-API-only concept.
//
// NOTE: the doc's URL itself is NOT exported from here — a 'use server' file
// may only export async functions (they become Server Action RPC proxies);
// exporting a plain string constant gets mangled when imported into a client
// component. It's defined directly in the page component instead.
const DOCUMENT_ID = '1LoGRk5TxbPtRCZ4BUAtQyqmJdDXwfYQ9jLI_10mhAtU';

function parseRun(textRun: any): WebsiteEditsRun {
  const style = textRun.textStyle || {};
  return {
    text: textRun.content || '',
    bold: !!style.bold,
    italic: !!style.italic,
    link: style.link?.url || undefined,
  };
}

function paragraphBlock(runs: WebsiteEditsRun[], paragraph: any): WebsiteEditsBlock {
  const namedStyle = paragraph.paragraphStyle?.namedStyleType || '';
  const headingMatch = namedStyle.match(/^HEADING_(\d)$/);
  if (headingMatch) {
    return { type: 'heading', level: parseInt(headingMatch[1], 10), runs };
  }
  return { type: 'paragraph', runs, bullet: !!paragraph.bullet };
}

function parseTabBlocks(documentTab: any): WebsiteEditsBlock[] {
  const inlineObjects = documentTab.inlineObjects || {};
  const blocks: WebsiteEditsBlock[] = [];
  const content = documentTab.body?.content || [];

  for (const el of content) {
    if (el.paragraph) {
      let runs: WebsiteEditsRun[] = [];

      for (const pe of el.paragraph.elements || []) {
        if (pe.inlineObjectElement) {
          if (runs.some((r) => r.text.trim())) {
            blocks.push(paragraphBlock(runs, el.paragraph));
            runs = [];
          }
          const objectId = pe.inlineObjectElement.inlineObjectId;
          const uri = inlineObjects[objectId]?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri;
          if (uri) blocks.push({ type: 'image', url: uri });
        } else if (pe.textRun) {
          runs.push(parseRun(pe.textRun));
        }
      }

      if (runs.some((r) => r.text.trim())) {
        blocks.push(paragraphBlock(runs, el.paragraph));
      }
    } else if (el.table) {
      const rows: string[][] = [];
      for (const row of el.table.tableRows || []) {
        const cells: string[] = [];
        for (const cell of row.tableCells || []) {
          let cellText = '';
          for (const cEl of cell.content || []) {
            for (const pe of cEl.paragraph?.elements || []) {
              if (pe.textRun) cellText += pe.textRun.content;
            }
          }
          cells.push(cellText.trim());
        }
        rows.push(cells);
      }
      blocks.push({ type: 'table', rows });
    }
  }

  return blocks;
}

function flattenTabs(rawTabs: any[], depth = 0): WebsiteEditsTab[] {
  const result: WebsiteEditsTab[] = [];
  for (const t of rawTabs) {
    result.push({
      id: t.tabProperties?.tabId || '',
      title: t.tabProperties?.title || 'Untitled',
      depth,
      blocks: parseTabBlocks(t.documentTab || {}),
    });
    if (t.childTabs?.length) {
      result.push(...flattenTabs(t.childTabs, depth + 1));
    }
  }
  return result;
}

export async function getWebsiteEditsTabs(): Promise<WebsiteEditsTab[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return [];

    const url = `https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}?includeTabsContent=true`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        // The doc changes throughout the day as edit requests get added —
        // a few minutes of staleness is a fine trade against fetching the
        // entire (large) document on every single page load. Tagged so a
        // successful write (see appendToWebsiteEditsTab) can force-refresh it.
        next: { revalidate: 300, tags: [DOC_CACHE_TAG] },
      },
      20000 // the doc is large (~400KB+) — longer than the default, but still
      // well under maxDuration above so our own timeout wins that race.
    );
    if (!res.ok) return [];

    const data = await res.json();
    return flattenTabs(data.tabs || []);
  } catch {
    return [];
  }
}

// Appends a new paragraph to the end of one tab's body — the actual pattern
// this doc is used with (new dated edit requests tacked on), rather than
// arbitrary in-place editing of existing text, which the Docs API's
// index-based addressing makes much riskier to get right from a UI.
export async function appendToWebsiteEditsTab(
  tabId: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { success: false, error: 'Nothing to add.' };

  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { success: false, error: 'Could not authenticate with Google.' };

    // Fetch fresh (no cache) — we need the CURRENT end index of this tab's
    // body right now, not a possibly-stale cached one, or the insert could
    // land in the wrong place or fail outright.
    const getRes = await fetchWithTimeout(
      `https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}?includeTabsContent=true`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
      12000 // this function does two sequential fetches — keep each comfortably
      // under half of maxDuration so their combined worst case doesn't approach it
    );
    if (!getRes.ok) return { success: false, error: 'Could not reach the document.' };

    const doc = await getRes.json();
    const tab = findTabById(doc.tabs || [], tabId);
    if (!tab) return { success: false, error: 'That tab no longer exists — refresh and try again.' };

    const content = tab.documentTab?.body?.content || [];
    const lastElement = content[content.length - 1];
    if (!lastElement) return { success: false, error: 'Could not locate where to insert text.' };

    // Insert just before the document's mandatory trailing newline, so this
    // lands as a new paragraph after the existing content rather than inside it.
    const insertIndex = Math.max(1, lastElement.endIndex - 1);

    const updateRes = await fetchWithTimeout(
      `https://docs.googleapis.com/v1/documents/${DOCUMENT_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { tabId, index: insertIndex },
                text: `\n${trimmed}`,
              },
            },
          ],
        }),
      },
      12000
    );

    if (!updateRes.ok) {
      const errBody = await updateRes.text().catch(() => '');
      return { success: false, error: `Google rejected the update (${updateRes.status}). ${errBody.slice(0, 200)}` };
    }

    revalidateTag(DOC_CACHE_TAG);
    return { success: true };
  } catch {
    return { success: false, error: 'Could not reach Google — try again in a moment.' };
  }
}

function findTabById(tabs: any[], tabId: string): any {
  for (const t of tabs) {
    if (t.tabProperties?.tabId === tabId) return t;
    if (t.childTabs?.length) {
      const found = findTabById(t.childTabs, tabId);
      if (found) return found;
    }
  }
  return null;
}
