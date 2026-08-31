// A hanging external call (Google's OAuth/Sheets/Docs APIs, or the network
// path to them) must never leave a page stuck on a spinner forever — abort
// and let the caller's existing catch/fallback handle it instead.
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
