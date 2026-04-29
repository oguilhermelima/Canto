import type { Database } from "@canto/db/client";
import { findMediaById } from "../../../infra/repositories";
import {
  findAspectStates,
  type MediaAspectStateRow,
} from "../../../infra/media/media-aspect-state-repository";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import { getActiveUserLanguages } from "../../shared/services/user-service";
import {
  buildForceAspects,
  buildMediaContext,
  classifyError,
  computePlan,
  effectiveProvider,
  loadCadenceKnobs,
  scopesFor,
  stateKey,
  writeAspectState,
  type CadenceSignal,
  type Outcome,
} from "./cadence";
import type {
  Aspect,
  EnsureMediaResult,
  EnsureMediaSpec,
} from "./ensure-media.types";
import { getTmdbProvider } from "../../../platform/http/tmdb-client";
import { getTvdbProvider } from "../../../platform/http/tvdb-client";
import { getSetting } from "@canto/db/settings";
import {
  enrichmentRegistry,
  fireSharedCapabilities,
  topoSortPlanItems,
  type EnrichmentCtx,
  type EnrichmentMediaRow,
} from "../enrichment";

/**
 * Unified "make sure this media is complete" engine.
 *
 * Callers specify what they need (languages + aspects) and the cadence
 * planner decides which (aspect, scope) tuples are due. Each aspect maps to
 * a strategy in `enrichmentRegistry`; the orchestrator coalesces strategies
 * by their declared `needs` so a single provider call can satisfy several
 * aspects (e.g. one `tmdb.metadata` fetch covers metadata + structure +
 * translations + contentRatings).
 *
 * Idempotent: every executed (aspect, scope) is recorded in
 * `media_aspect_state`, so re-runs pick up where the previous one left off.
 */
export async function ensureMedia(
  db: Database,
  mediaId: string,
  spec: EnsureMediaSpec = {},
  providers?: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
): Promise<EnsureMediaResult> {
  const start = Date.now();
  const result: EnsureMediaResult = initResult(mediaId);

  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) {
    throw new Error(`ensureMedia: media ${mediaId} not found`);
  }

  const languages = (
    spec.languages ?? [...(await getActiveUserLanguages(db))]
  ).filter((l) => !!l);
  result.languagesProcessed = languages;

  const knobs = await loadCadenceKnobs(db);
  const aspectStates = await findAspectStates(db, mediaId);
  const stateByKey = new Map<string, MediaAspectStateRow>(
    aspectStates.map((r) => [stateKey(r.aspect as Aspect, r.scope), r]),
  );
  const tvdbDefaultShows = (await getSetting("tvdb.defaultShows")) === true;
  const provider = effectiveProvider(
    {
      type: mediaRow.type,
      provider: mediaRow.provider,
      overrideProviderFor: mediaRow.overrideProviderFor,
    },
    { tvdbDefaultShows },
  );
  const mediaContext = buildMediaContext(mediaRow);
  const now = new Date();
  const signal: CadenceSignal = spec.force ? "forced" : "visited";

  const plan = computePlan({
    state: aspectStates,
    ctx: mediaContext,
    signal,
    activeLanguages: languages,
    effectiveProvider: provider,
    forceAspects: buildForceAspects(spec, languages),
    knobs,
    now,
  });

  if (plan.items.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  const deps = providers ?? {
    tmdb: await getTmdbProvider(),
    tvdb: await getTvdbProvider(),
  };

  const ctx: EnrichmentCtx = {
    mediaRow: mediaRow as EnrichmentMediaRow,
    effectiveProvider: provider,
    languages,
    planTranslationLangs: scopesFor(plan.items, "translations"),
    planLogoLangs: scopesFor(plan.items, "logos"),
    spec,
    result,
    scratch: {},
  };

  // 1. Fire shared capabilities once each. Self-fetched capabilities
  //    (logos / extras / per-scope translations) come back undefined.
  const responses = await fireSharedCapabilities(plan.items, ctx, deps);

  // 2. Topologically sort plan items so e.g. metadata writes commit before
  //    structure / translations / contentRatings strategies read the row.
  const sortedItems = topoSortPlanItems(plan.items, enrichmentRegistry);

  for (const item of sortedItems) {
    const strategy = enrichmentRegistry[item.aspect];
    let outcome: Outcome;
    try {
      outcome = await strategy.applyToAspect({
        db,
        mediaId,
        scope: item.scope,
        ctx,
        response: responses.get(strategy.needs),
        deps,
      });
    } catch (err) {
      outcome = classifyError(err);
    }

    await writeAspectState({
      db,
      mediaId,
      aspect: item.aspect,
      scope: item.scope,
      outcome,
      ctx: mediaContext,
      knobs,
      stateByKey,
      now,
      provider,
    });
  }

  result.durationMs = Date.now() - start;
  return result;
}

function initResult(mediaId: string): EnsureMediaResult {
  return {
    mediaId,
    aspectsExecuted: [],
    languagesProcessed: [],
    providerCalls: { tmdb: 0, tvdb: 0 },
    writes: {
      media: false,
      structureSeasons: 0,
      structureEpisodes: 0,
      translationsMedia: 0,
      translationsSeason: 0,
      translationsEpisode: 0,
      logos: 0,
      extras: 0,
      contentRatings: 0,
    },
    skipped: {},
    durationMs: 0,
  };
}

// Re-export the base media row helper so that callers building bulk flows
// don't need a second import.
export { findMediaById };
