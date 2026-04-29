import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaLocalization } from "@canto/db/schema";
import { upsertMediaLocalization } from "../../shared/localization";

/**
 * Upsert language-specific logo paths into media_localization.
 *
 * Only persists logos whose TMDB language tag matches a supported language
 * exactly. The previous behaviour mapped a bare 2-letter prefix (e.g. "pt")
 * onto the first regional supported variant (e.g. "pt-BR"), which silently
 * stored pt-PT-uploaded logos as pt-BR — TMDB tags images by iso_639_1 only,
 * so "pt" conflates pt-BR and pt-PT. With the prefix mapping gone, ambiguous
 * regional logos fall back to the base English logo at read time instead of
 * showing the wrong region.
 *
 * Skips when no en-US localization row exists for the media yet — the upsert
 * helper requires a title and the next translations refresh will seed it.
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
  const enTitle = enLocRow[0]?.title;
  if (!enTitle) return 0;

  let writes = 0;
  for (const [tmdbCode, logoPath] of byLangIso639_1) {
    if (!supported.has(tmdbCode)) continue;
    try {
      await upsertMediaLocalization(
        db,
        mediaId,
        tmdbCode,
        { title: enTitle, logoPath },
        "tmdb",
      );
      writes += 1;
    } catch {
      // FK rejects unknown locale codes — skip silently.
    }
  }
  return writes;
}
