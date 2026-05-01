import type {
  ApplyArgs,
  MediaEnrichmentStrategy,
  SharedMetadataResponse,
} from "@canto/core/domain/media/enrichment/types";
import { reconcileShowStructure } from "@canto/core/domain/media/use-cases/reconcile-show-structure";

/**
 * Show season/episode scaffolding. For TMDB-native shows running on the
 * default cadence, the seasons are already written by `metadata` (via
 * `updateMediaFromNormalized` → `upsertSeasons`). For source migrations —
 * `materialized_source` mismatches the effective provider — we drop the
 * stale TMDB-numbered structure and reseed from TVDB. Replaces the legacy
 * `replaceShowWithTvdb` worker shell.
 *
 * Idempotent: when the row already matches the effective provider, we just
 * record the success outcome and let cadence push the next eligibility out.
 */
export const structureStrategy: MediaEnrichmentStrategy<
  SharedMetadataResponse | undefined
> = {
  aspect: "structure",
  dependsOn: ["metadata"],
  needs: "tmdb.metadata",
  async applyToAspect(
    args: ApplyArgs<SharedMetadataResponse | undefined>,
  ) {
    const { db, mediaId, ctx, deps } = args;

    if (ctx.mediaRow.type !== "show") {
      ctx.result.aspectsExecuted.push("structure");
      return "data";
    }

    if (ctx.effectiveProvider === "tvdb" && ctx.mediaRow.provider !== "tvdb") {
      // Source migration path: drop+reseed from TVDB. `reconcileShowStructure`
      // owns the destructive transaction (detach user data, swap seasons,
      // re-attach files/playback) so we delegate rather than duplicating the
      // critical section. Translation dispatch is suppressed because the
      // `translations` strategy runs later in this same pass.
      await reconcileShowStructure(
        db,
        {
          media: ctx.deps.media,
          localization: ctx.deps.localization,
          tmdb: deps.tmdb,
          tvdb: deps.tvdb,
          logger: ctx.deps.logger,
          userPrefs: ctx.deps.userPrefs,
        },
        mediaId,
        { force: true, dispatchTranslations: false },
      );
      ctx.result.providerCalls.tvdb += 1;
    }

    ctx.result.aspectsExecuted.push("structure");
    return "data";
  },
};
