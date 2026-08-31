// Shared OAuth helper for reading Google Sheets that aren't link-shared.
// The org blocks service-account key creation, so a user-consented refresh
// token is used instead of a service account. Used by any server action that
// needs to read a private Google Sheet (site reviews, EOD sites, speeds, ...).

import { fetchWithTimeout } from './fetchWithTimeout';

// Reused across requests on the same warm serverless instance — avoids paying
// for a full OAuth token exchange (a real network round trip to Google) on
// every single page load. Tokens are valid ~1hr; refreshed 60s before expiry.
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_SHEETS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
    };
    return cachedToken.token;
  } catch {
    // Network error or timeout — treat exactly like any other auth failure.
    return null;
  }
}
