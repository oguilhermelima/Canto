import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaLocalization, mediaTranslation } from "@canto/db/schema";
import { upsertMediaLocalization } from "../../shared/localization";

/**
 * Upsert language-specific logo paths into `media_translation`.
 *
 * Only persists logos whose TMDB language tag matches a supported language
 * exactly. The previous behaviour mapped a bare 2-letter prefix (e.g. "pt")
 * onto the first regional supported variant (e.g. "pt-BR"), which silently
 * stored pt-PT-uploaded logos as pt-BR — TMDB tags images by iso_639_1 only,
 * so "pt" conflates pt-BR and pt-PT. With the prefix mapping gone, ambiguous
 * regional logos fall back to the base English logo at read time instead of
 * showing the wrong region.
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

  const supported = new Set<string>();
  for (const code of targetLanguages) {
    if (code.startsWith("en")) continue;
    supported.add(code);
  }

  // Dual-write needs a title (the new media_localization.title is required and
  // the upsert helper enforces it). Look up the existing en-US localization row
  // once; if absent, only the legacy mediaTranslation insert runs and the
  // localization row will be filled in later by the translations refresh.
  // Removed in Phase 1C-δ.
  const enLocRow = await db
    .select({ title: mediaLocalization.title })
    .from(mediaLocalization)
    .where(
      and(
        eq(mediaLocalization.mediaId, mediaId),
        eq(mediaLocalization.language, "en-US"),
      ),
    )
    .limit(1);
  const enTitle = enLocRow[0]?.title ?? null;

  let writes = 0;
  for (const [tmdbCode, logoPath] of byLangIso639_1) {
    if (!supported.has(tmdbCode)) continue;
    const fullCode = tmdbCode;
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

      // Dual-write to media_localization (removed in Phase 1C-δ). Skip when no
      // en-US row exists yet; the next translations refresh will create one.
      if (enTitle) {
        try {
          await upsertMediaLocalization(
            db,
            mediaId,
            fullCode,
            { title: enTitle, logoPath },
            "tmdb",
          );
        } catch {
          // Mirror the legacy try/catch behaviour for unsupported language codes.
        }
      }
    } catch {
      // FK to supported_language rejects unknown codes — skip silently.
    }
  }
  return writes;
}
