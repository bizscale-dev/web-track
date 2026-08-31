'use server';

import { getGoogleAccessToken } from '@/lib/googleAuth';
import type { EodSiteOption } from '@/type/eod';

// Separate Google Sheet from the EOD one — accessed via OAuth (the org blocks
// service-account key creation, so a user-consented refresh token is used
// instead of a service account) since this sheet isn't link-shared.
const SPREADSHEET_ID = '1kDDJqd-aefKwmn7VUoycaahWduOTMNVl5lmoPkgkTi8';
const SHEET_TAB = 'Active Clients';
// Two identical URL+Name blocks on this tab (row 1 is the header):
// Column C = Site URL, Column D = Client Name
// Column K = Site URL, Column L = Client Name
const DATA_RANGES = [`'${SHEET_TAB}'!C2:D1000`, `'${SHEET_TAB}'!K2:L1000`];

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function getReviewSiteOptions(): Promise<EodSiteOption[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return [];

    const rangeParams = DATA_RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${rangeParams}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // The sheet doesn't change second-to-second — reuse the response for a
      // minute instead of round-tripping to Google on every page load.
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const valueRanges: { values?: string[][] }[] = data.valueRanges || [];

    const seen = new Set<string>();
    const options: EodSiteOption[] = [];

    for (const range of valueRanges) {
      for (const row of range.values || []) {
        const rawUrl = (row[0] || '').trim();
        const name = (row[1] || '').trim();
        if (!rawUrl || !name || seen.has(name.toLowerCase())) continue;

        options.push({ name, domain: originOf(rawUrl), status: 'live' });
        seen.add(name.toLowerCase());
      }
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
