import { sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaTranslation } from "@canto/db/schema";

/**
 * Upsert language-specific logo paths into `media_translation`.
 *
 * Maps TMDB ISO 639-1 codes (e.g. "pt") to the matching supported-language
 * codes (e.g. "pt-BR"). Exact match preferred; 2-letter prefix used as
 * fallback. Unknown languages are skipped silently.
 *
 * Shared by `fetchLogos` (browse-time, may lack persisted media) and
 * `ensureMedia` (engine, always has a persisted media). Keeps logo-write
 * semantics in one place.
 */
export async function upsertLangLogos(
  db: Database,
  mediaId: string,
  byLangIso639_1: Map<string, string>,
  targetLanguages: Iterable<string>,
): Promise<number> {
  if (byLangIso639_1.size === 0) return 0;

  const langToFull = new Map<string, string>();
  for (const code of targetLanguages) {
    if (code.startsWith("en")) continue;
    langToFull.set(code, code);
    const prefix = code.split("-")[0];
    if (prefix && !langToFull.has(prefix)) langToFull.set(prefix, code);
  }

  let writes = 0;
  for (const [tmdbCode, logoPath] of byLangIso639_1) {
    const fullCode = langToFull.get(tmdbCode);
    if (!fullCode) continue;
    try {
      await db
        .insert(mediaTranslation)
        .values({ mediaId, language: fullCode, logoPath })
        .onConflictDoUpdate({
          target: [mediaTranslation.mediaId, mediaTranslation.language],
          set: {
            logoPath: sql`COALESCE(EXCLUDED.logo_path, ${mediaTranslation.logoPath})`,
          },
        });
      writes += 1;
    } catch {
      // FK to supported_language rejects unknown codes — skip silently.
    }
  }
  return writes;
}
