'use server';

import { getGoogleAccessToken } from '@/lib/googleAuth';
import type { WebsiteEditsBlock, WebsiteEditsRun, WebsiteEditsTab } from '@/type/websiteEdits';

// "Website Edits" doc — one tab per client site, each holding free-form edit
// requests (text + embedded images). Uses the Docs API (not Drive's flat
// export) specifically because tabs are a Docs-API-only concept.
const DOCUMENT_ID = '1LoGRk5TxbPtRCZ4BUAtQyqmJdDXwfYQ9jLI_10mhAtU';
export const WEBSITE_EDITS_DOC_URL = `https://docs.google.com/document/d/${DOCUMENT_ID}/edit?usp=sharing`;

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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // The doc changes throughout the day as edit requests get added —
      // a few minutes of staleness is a fine trade against fetching the
      // entire (large) document on every single page load.
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return flattenTabs(data.tabs || []);
  } catch {
    return [];
  }
}
