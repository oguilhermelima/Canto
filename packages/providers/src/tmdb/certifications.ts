import type { TmdbClient } from "./client";

export interface CertificationEntry {
  region: string;
  rating: string;
  meaning?: string;
  order: number;
}

/**
 * Fetch TMDB's catalog of certifications for movies or TV.
 * TMDB endpoint: `/certification/{movie|tv}/list`.
 */
export async function getCertifications(
  client: TmdbClient,
  type: "movie" | "tv",
): Promise<CertificationEntry[]> {
  const endpoint = `/certification/${type}/list`;
  const data = await client.fetch<{
    certifications?: Record<
      string,
      Array<{ certification: string; meaning?: string; order?: number }>
    >;
  }>(endpoint);

  const out: CertificationEntry[] = [];
  for (const [region, entries] of Object.entries(data.certifications ?? {})) {
    for (const entry of entries) {
      if (!entry.certification) continue;
      out.push({
        region,
        rating: entry.certification,
        meaning: entry.meaning,
        order: entry.order ?? 0,
      });
    }
  }
  return out;
}
