import type { TvdbProvider } from "@canto/providers";

import type {
  ApplyArgs,
  MediaEnrichmentStrategy,
  SharedMetadataResponse,
} from "@canto/core/domain/media/enrichment/types";
import { translateEpisodes } from "@canto/core/domain/content-enrichment/use-cases/translate-episodes";

/**
 * Per-language overlays. Media-level translations (title, overview, tagline,
 * posterPath, logoPath) are written by the `metadata` strategy via
 * `updateMediaFromNormalized → persistTranslations` — this strategy only
 * needs to fan out the TVDB episode-translation fallback for shows whose
 * TMDB payload didn't cover season/episode strings in the target language.
 *
 * Skips when `tvdbFailed` was set on the shared metadata response — TVDB
 * already 4xx'd on `/series/:id/extended` and the per-language
 * `/episodes/default` endpoint will hit the same wall.
 */
export const translationsStrategy: MediaEnrichmentStrategy<
  SharedMetadataResponse | undefined
> = {
  aspect: "translations",
  dependsOn: ["structure"],
  needs: "tmdb.metadata",
  async applyToAspect(
    args: ApplyArgs<SharedMetadataResponse | undefined>,
  ) {
    const { mediaId, scope, ctx, response, deps } = args;
    if (!ctx.result.aspectsExecuted.includes("translations")) {
      ctx.result.aspectsExecuted.push("translations");
    }

    const lang = scope;
    if (!lang || lang.startsWith("en")) return "data";
    if (
      ctx.mediaRow.type !== "show" ||
      !ctx.mediaRow.tvdbId ||
      response?.tvdbFailed
    ) {
      return "data";
    }

    try {
      await translateEpisodes(
        {
          localization: ctx.deps.localization,
          media: ctx.deps.media,
          logger: ctx.deps.logger,
        },
        mediaId,
        ctx.mediaRow.tvdbId,
        lang,
        deps.tvdb as unknown as TvdbProvider,
      );
      ctx.result.providerCalls.tvdb += 1;
    } catch {
      // TVDB may not have translations for this language — non-fatal. The
      // surrounding orchestrator records `data` anyway because the media-
      // level overlay was successfully written by `metadata`.
    }
    return "data";
  },
};
