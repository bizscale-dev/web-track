'use server';

import type { EodSitePage } from '@/type/eod';

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
