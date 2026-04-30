import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaLocalization } from "@canto/db/schema";
import { upsertMediaLocalization } from "../../shared/localization";

/**
 * Resolve a TMDB iso_639_1 code (e.g. "pt") onto the supported full locale
 * code (e.g. "pt-BR") that should receive its assets. Strategy:
 *
 *   1. Exact match (rare — TMDB only emits 2-letter codes, but a configured
 *      operator could in theory list "pt" itself as a supported locale).
 *   2. Prefix match when EXACTLY ONE supported regional variant shares the
 *      prefix. e.g. supported = ["pt-BR"] and tmdbCode = "pt" → "pt-BR".
 *   3. Returns `null` when multiple regional variants share the prefix
 *      (ambiguous — TMDB cannot distinguish pt-BR vs pt-PT uploads, so
 *      assigning "pt" assets to either would risk mis-region content).
 *
 * Used by both the engine-side write path (`upsertLangLogos`) and the
 * browse-time read path (`fetchLogos`) so they share the same notion of
 * "what does TMDB's `pt` tag mean for this user/server."
 */
export function resolveSupportedLocale(
  tmdbCode: string,
  supported: Iterable<string>,
): string | null {
  let exact: string | null = null;
  let prefixMatch: string | null = null;
  let prefixMatches = 0;
  for (const code of supported) {
    if (code.startsWith("en")) continue;
    if (code === tmdbCode) {
      exact = code;
      continue;
    }
    if (code.split("-")[0] === tmdbCode) {
      prefixMatches += 1;
      prefixMatch = code;
    }
  }
  if (exact) return exact;
  return prefixMatches === 1 ? prefixMatch : null;
}

/**
 * Upsert language-specific logo paths into media_localization.
 *
 * Resolves each TMDB language tag onto a supported regional locale via
 * `resolveSupportedLocale`. When the supported set includes only one
 * regional variant for a TMDB prefix (e.g. only `pt-BR`), the logo is
 * persisted under that variant. When multiple variants share the prefix
 * (e.g. both `pt-BR` and `pt-PT`), the logo is skipped because TMDB tags
 * images by iso_639_1 only and we cannot tell which region uploaded it —
 * the read-side COALESCE then falls back to the English logo instead of
 * risking a wrong-region asset.
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
    const targetLocale = resolveSupportedLocale(tmdbCode, supported);
    if (!targetLocale) continue;
    try {
      await upsertMediaLocalization(
        db,
        mediaId,
        targetLocale,
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
