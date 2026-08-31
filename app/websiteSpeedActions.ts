'use server';

import { getGoogleAccessToken } from '@/lib/googleAuth';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { WebsiteSpeed } from '@/type/websiteSpeed';

// "Website Speed Optimization Tracker" sheet — PageSpeed Insights scores per
// site, kept up to date by whoever runs the checks. Columns (row 1 = header):
// A = Name, B = Website, C = Desktop score, D = Mobile score,
// E = Last Checked, F = Report URL
const SPREADSHEET_ID = '1j9ogkLdvLfX5KtWaNYxxY1cXkJ6AftXzQVtOIbPDC_s';
const DATA_RANGE = "Sheet1!A2:F1000";

function parseScore(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function getWebsiteSpeeds(): Promise<WebsiteSpeed[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return [];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(DATA_RANGE)}`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // The sheet only changes when someone re-runs a speed check — a minute
      // of staleness is a fine trade for not round-tripping to Google every load.
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const rows: string[][] = data.values || [];

    const speeds: WebsiteSpeed[] = rows
      .filter((row) => (row[0] || '').trim())
      .map((row) => ({
        name: (row[0] || '').trim(),
        url: (row[1] || '').trim() || null,
        desktopScore: parseScore(row[2] || ''),
        mobileScore: parseScore(row[3] || ''),
        lastChecked: (row[4] || '').trim() || null,
        reportUrl: (row[5] || '').trim() || null,
      }));

    return speeds.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
