'use server';

import { inflateRawSync } from 'node:zlib';
import type { EodSiteOption, EodSitePage } from '@/type/eod';

// SECURITY: this sheet is a credentials vault (plaintext admin usernames/passwords
// live alongside the site names). This URL and the raw workbook bytes must never be
// sent to the client — only the extracted { name, domain, status } fields below may
// cross the server/client boundary.
//
// We read the .xlsx export (not CSV) because the "live" site names are hyperlinked
// to their real admin URLs in the sheet — the CSV export silently drops hyperlinks
// and only keeps the visible display text, which loses the domain entirely.
const SHEET_XLSX_URL =
  'https://docs.google.com/spreadsheets/d/1ovenFQRIKZuI4zD6n5C7dSydBt_k4itR_qzUa0wN_ks/export?format=xlsx';
const TARGET_SHEET_NAME = 'Current Clients Creds';

// ---- Minimal dependency-free ZIP reader (xlsx is a zip archive) ----
function readZipEntries(buf: Buffer, wanted: string[]): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  const wantedSet = new Set(wanted);

  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return result;

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let ptr = buf.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < totalEntries && result && Object.keys(result).length < wantedSet.size; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;

    const compressionMethod = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const fileNameLength = buf.readUInt16LE(ptr + 28);
    const extraFieldLength = buf.readUInt16LE(ptr + 30);
    const fileCommentLength = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const fileName = buf.toString('utf8', ptr + 46, ptr + 46 + fileNameLength);

    if (wantedSet.has(fileName)) {
      const lhFileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
      const lhExtraFieldLength = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhFileNameLength + lhExtraFieldLength;
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      result[fileName] = compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    }

    ptr += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return result;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string): string[] {
  const items: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml))) {
    const texts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((tm) => tm[1]);
    items.push(decodeXmlEntities(texts.join('')));
  }
  return items;
}

function parseRelationships(xml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const relRegex = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = relRegex.exec(xml))) map[m[1]] = m[2];
  return map;
}

function parseColumnCells(sheetXml: string, column: string, sharedStrings: string[]): Map<number, string> {
  const values = new Map<number, string>();
  const cellRegex = new RegExp(`<c r="${column}(\\d+)"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(sheetXml))) {
    const row = parseInt(m[1], 10);
    const attrs = m[2] || '';
    const inner = m[3] || '';
    const type = attrs.match(/ t="([^"]*)"/)?.[1] || null;

    let value = '';
    if (type === 's') {
      const idx = inner.match(/<v>(\d+)<\/v>/)?.[1];
      if (idx !== undefined) value = sharedStrings[parseInt(idx, 10)] || '';
    } else if (type === 'inlineStr') {
      value = decodeXmlEntities([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((tm) => tm[1]).join(''));
    } else {
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v !== undefined) value = decodeXmlEntities(v);
    }

    if (value.trim()) values.set(row, value.trim());
  }
  return values;
}

function parseColumnHyperlinks(
  sheetXml: string,
  column: string,
  relationships: Record<string, string>
): Map<number, string> {
  const links = new Map<number, string>();
  const block = sheetXml.match(/<hyperlinks>([\s\S]*?)<\/hyperlinks>/)?.[1];
  if (!block) return links;

  // Attribute order on <hyperlink> varies (r:id before ref, or vice versa) —
  // match the whole tag first, then pull ref/r:id independently.
  const tagRegex = /<hyperlink\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(block))) {
    const tag = m[0];
    const refMatch = tag.match(/ref="([A-Z]+)(\d+)"/);
    const ridMatch = tag.match(/r:id="([^"]+)"/);
    if (!refMatch || !ridMatch || refMatch[1] !== column) continue;
    const target = relationships[ridMatch[1]];
    if (target) links.set(parseInt(refMatch[2], 10), target);
  }
  return links;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function getEodSiteOptions(): Promise<EodSiteOption[]> {
  try {
    const res = await fetch(SHEET_XLSX_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const buf = Buffer.from(await res.arrayBuffer());

    const workbookFiles = readZipEntries(buf, ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels']);
    const workbookXml = workbookFiles['xl/workbook.xml']?.toString('utf8');
    const workbookRelsXml = workbookFiles['xl/_rels/workbook.xml.rels']?.toString('utf8');
    if (!workbookXml || !workbookRelsXml) return [];

    const sheetRid =
      workbookXml.match(new RegExp(`<sheet[^>]*name="${TARGET_SHEET_NAME}"[^>]*r:id="([^"]+)"`))?.[1] ||
      workbookXml.match(new RegExp(`<sheet[^>]*r:id="([^"]+)"[^>]*name="${TARGET_SHEET_NAME}"`))?.[1];
    if (!sheetRid) return [];

    const workbookRels = parseRelationships(workbookRelsXml);
    const sheetPath = workbookRels[sheetRid]; // e.g. "worksheets/sheet1.xml"
    if (!sheetPath) return [];

    const sheetFullPath = `xl/${sheetPath}`;
    const sheetRelsPath = `xl/worksheets/_rels/${sheetPath.split('/').pop()}.rels`;

    const dataFiles = readZipEntries(buf, [sheetFullPath, sheetRelsPath, 'xl/sharedStrings.xml']);
    const sheetXml = dataFiles[sheetFullPath]?.toString('utf8');
    if (!sheetXml) return [];
    const sheetRelsXml = dataFiles[sheetRelsPath]?.toString('utf8') || '';
    const sharedStringsXml = dataFiles['xl/sharedStrings.xml']?.toString('utf8') || '';

    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const sheetRels = parseRelationships(sheetRelsXml);

    const namesB = parseColumnCells(sheetXml, 'B', sharedStrings);
    const linksB = parseColumnHyperlinks(sheetXml, 'B', sheetRels);
    const namesJ = parseColumnCells(sheetXml, 'J', sharedStrings);
    const namesG = parseColumnCells(sheetXml, 'G', sharedStrings);

    const options: EodSiteOption[] = [];
    const seen = new Set<string>();

    for (const [row, name] of namesB) {
      if (row === 1 || !name || seen.has(name.toLowerCase())) continue; // row 1 is the header
      const link = linksB.get(row);
      options.push({ name, domain: link ? originOf(link) : null, status: 'live' });
      seen.add(name.toLowerCase());
    }

    for (const [row, name] of namesJ) {
      if (row === 1 || !name || name.toLowerCase() === 'free' || seen.has(name.toLowerCase())) continue;
      const gUrl = namesG.get(row) || '';
      options.push({ name, domain: gUrl ? originOf(gUrl) : null, status: 'subdomain_wip' });
      seen.add(name.toLowerCase());
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function labelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'Home';

    const slug = decodeURIComponent(segments[segments.length - 1]).replace(/[-_]+/g, ' ').trim();
    if (!slug) return 'Home';

    return slug.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  } catch {
    return url;
  }
}

const SITEMAP_FETCH_TIMEOUT_MS = 8000;
const MAX_CHILD_SITEMAPS = 20;
const MAX_TOTAL_PAGES = 300;

async function fetchXml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITEMAP_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractLocs(xml: string): string[] {
  return (xml.match(/<loc>(.*?)<\/loc>/g) || []).map((m) => m.replace(/<\/?loc>/g, '').trim());
}

export async function getSitePages(
  domain: string
): Promise<{ pages: EodSitePage[]; error: string | null }> {
  try {
    const base = normalizeDomain(domain);
    const content = await fetchXml(`${base}/sitemap.xml`);

    if (content === null) {
      return { pages: [], error: 'Sitemap unavailable' };
    }

    const pageUrls = new Set<string>();

    // WordPress + Yoast/RankMath (the common case here) publish a sitemap INDEX
    // pointing at per-type child sitemaps (post-sitemap.xml, page-sitemap.xml,
    // category-sitemap.xml, ...). We only want actual site PAGES, not blog posts
    // or taxonomy pages, so only expand the child sitemap(s) named "page-sitemap".
    if (/<sitemapindex/i.test(content)) {
      const childSitemaps = extractLocs(content)
        .filter((loc) => /page-sitemap/i.test(loc))
        .slice(0, MAX_CHILD_SITEMAPS);

      if (childSitemaps.length === 0) {
        return { pages: [], error: 'No page sitemap found for this site' };
      }

      for (const childUrl of childSitemaps) {
        const childContent = await fetchXml(childUrl);
        if (!childContent) continue;

        for (const loc of extractLocs(childContent)) {
          pageUrls.add(loc);
          if (pageUrls.size >= MAX_TOTAL_PAGES) break;
        }
        if (pageUrls.size >= MAX_TOTAL_PAGES) break;
      }
    } else {
      extractLocs(content).forEach((loc) => pageUrls.add(loc));
    }

    if (pageUrls.size === 0) {
      return { pages: [], error: 'No pages found in sitemap' };
    }

    const pages: EodSitePage[] = [...pageUrls]
      .map((url) => ({ label: labelFromUrl(url), url }))
      .sort((a, b) => {
        if (a.label === 'Home') return -1;
        if (b.label === 'Home') return 1;
        return a.label.localeCompare(b.label);
      });

    return { pages, error: null };
  } catch {
    return { pages: [], error: 'Could not reach that domain' };
  }
}
