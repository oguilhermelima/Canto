import { getSetting } from "@canto/db/settings";

/**
 * Raw TMDB GET for endpoints not yet covered by the provider port
 * (e.g. `/watch/providers/regions`, `/search/network`).
 */
export async function fetchFromTmdb<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText} — ${path} — ${body}`,
    );
  }
  return response.json() as Promise<T>;
}
