import type { MediaType, ProviderName } from "@canto/providers";

import { enrichmentRegistry } from "@canto/core/domain/media/enrichment/registry";
import type {
  ApiCapability,
  EnrichmentCtx,
} from "@canto/core/domain/media/enrichment/types";
import type { PlanItem } from "@canto/core/domain/media/use-cases/cadence/compute-plan";
import { fetchMediaMetadata } from "@canto/core/domain/media/use-cases/fetch-media-metadata";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";

interface FireCallDeps {
  tmdb: MediaProviderPort;
  tvdb: MediaProviderPort;
}

/**
 * Coalesce-by-needs: collect each unique `ApiCapability` referenced by the
 * plan and fire it once. Capabilities returning `undefined` (the strategy
 * self-fetches per scope) are dropped from the response map.
 */
export async function fireSharedCapabilities(
  items: PlanItem[],
  ctx: EnrichmentCtx,
  deps: FireCallDeps,
): Promise<Map<ApiCapability, unknown>> {
  const needed = new Set<ApiCapability>(
    items.map((i) => enrichmentRegistry[i.aspect].needs),
  );
  const responses = new Map<ApiCapability, unknown>();
  await Promise.all(
    [...needed].map(async (cap) => {
      const r = await fireCall(cap, ctx, deps);
      if (r !== undefined) responses.set(cap, r);
    }),
  );
  return responses;
}

/**
 * The orchestrator pre-fetches only `tmdb.metadata` because that single call
 * feeds metadata + structure + translations + contentRatings. Every other
 * capability is self-fetched inside its strategy (per-scope fan-out for logos
 * and episode translations; cross-provider IMDB fallback for extras).
 *
 * Returning `undefined` is the signal "self-fetched — no shared response".
 */
export async function fireCall(
  capability: ApiCapability,
  ctx: EnrichmentCtx,
  deps: FireCallDeps,
): Promise<unknown | undefined> {
  if (capability !== "tmdb.metadata") return undefined;

  const { mediaRow, effectiveProvider, languages, planTranslationLangs, spec } =
    ctx;

  const useTVDBSeasons =
    mediaRow.type === "show" &&
    !!mediaRow.tvdbId &&
    effectiveProvider === "tvdb" &&
    mediaRow.provider !== "tvdb";

  // English variants always come along (canonical metadata). Translation
  // scopes from the plan get folded in so the same fetch covers them too.
  const enLangs = languages.filter((l) => l.startsWith("en"));
  const langsForFetch = Array.from(
    new Set([...enLangs, ...planTranslationLangs]),
  );

  const fetched = await fetchMediaMetadata(
    mediaRow.externalId,
    mediaRow.provider as ProviderName,
    mediaRow.type as MediaType,
    deps,
    {
      useTVDBSeasons,
      supportedLanguages: langsForFetch,
      reprocess: spec.force,
    },
  );

  ctx.result.providerCalls.tmdb += 1;
  if (fetched.tvdbSeasons) ctx.result.providerCalls.tvdb += 1;

  return fetched;
}
