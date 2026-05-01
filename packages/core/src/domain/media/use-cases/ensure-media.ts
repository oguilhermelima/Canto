import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";

import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type {
  Aspect,
  MediaAspectState,
} from "@canto/core/domain/media/types/media-aspect-state";
import { loadCadenceKnobs } from "@canto/core/domain/media/use-cases/cadence/cadence-knobs";
import { effectiveProvider } from "@canto/core/domain/media/use-cases/cadence/effective-provider";
import type { Outcome } from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";
import {
  computePlan
  
} from "@canto/core/domain/media/use-cases/cadence/compute-plan";
import type {CadenceSignal} from "@canto/core/domain/media/use-cases/cadence/compute-plan";
import {
  buildForceAspects,
  buildMediaContext,
  classifyError,
  scopesFor,
  stateKey,
  writeAspectState,
} from "@canto/core/domain/media/use-cases/cadence/aspect-state-writer";
import type {
  EnsureMediaResult,
  EnsureMediaSpec,
} from "@canto/core/domain/media/use-cases/ensure-media.types";
import type {
  EnrichmentCtx,
  EnrichmentMediaRow,
} from "@canto/core/domain/media/enrichment/types";
import { enrichmentRegistry } from "@canto/core/domain/media/enrichment/registry";
import { fireSharedCapabilities } from "@canto/core/domain/media/enrichment/fire-call";
import { topoSortPlanItems } from "@canto/core/domain/media/enrichment/topo-sort";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import { findMediaById } from "@canto/core/infra/media/media-repository";
import { makeMediaAspectStateRepository } from "@canto/core/infra/media/media-aspect-state-repository.adapter";
import { makeMediaContentRatingRepository } from "@canto/core/infra/media/media-content-rating-repository.adapter";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";

/**
 * Repository ports the orchestrator needs. Callers (HTTP routers, worker
 * jobs, scripts) build these once at the entry-edge and pass them in so
 * `ensureMedia` never reaches back to the DB through ad-hoc helpers.
 *
 * `media`, `localization`, `aspectState`, and `contentRating` are the four
 * write-heavy ports the persist orchestration uses; extras lives behind its
 * own port surfaced in Wave 9C.
 */
export interface EnsureMediaDeps {
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  tmdb: MediaProviderPort;
  tvdb: MediaProviderPort;
  logger: LoggerPort;
}

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
  deps?: Partial<EnsureMediaDeps>,
): Promise<EnsureMediaResult> {
  const start = Date.now();
  const result: EnsureMediaResult = initResult(mediaId);

  const resolvedDeps = await resolveDeps(db, deps);

  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) {
    throw new Error(`ensureMedia: media ${mediaId} not found`);
  }

  const languages = (
    spec.languages ?? [...(await getActiveUserLanguages(db))]
  ).filter((l) => !!l);
  result.languagesProcessed = languages;

  const knobs = await loadCadenceKnobs(db);
  const aspectStates = await resolvedDeps.aspectState.findAllForMedia(mediaId);
  const stateByKey = new Map<string, MediaAspectState>(
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

  const ctx: EnrichmentCtx = {
    mediaRow: mediaRow as EnrichmentMediaRow,
    effectiveProvider: provider,
    languages,
    planTranslationLangs: scopesFor(plan.items, "translations"),
    planLogoLangs: scopesFor(plan.items, "logos"),
    spec,
    result,
    scratch: {},
    deps: resolvedDeps,
  };

  // 1. Fire shared capabilities once each. Self-fetched capabilities
  //    (logos / extras / per-scope translations) come back undefined.
  const responses = await fireSharedCapabilities(plan.items, ctx, {
    tmdb: resolvedDeps.tmdb,
    tvdb: resolvedDeps.tvdb,
  });

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
        deps: { tmdb: resolvedDeps.tmdb, tvdb: resolvedDeps.tvdb },
      });
    } catch (err) {
      outcome = classifyError(err);
    }

    await writeAspectState({
      aspectState: resolvedDeps.aspectState,
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

async function resolveDeps(
  db: Database,
  partial: Partial<EnsureMediaDeps> | undefined,
): Promise<EnsureMediaDeps> {
  return {
    media: partial?.media ?? makeMediaRepository(db),
    localization:
      partial?.localization ?? makeMediaLocalizationRepository(db),
    aspectState:
      partial?.aspectState ?? makeMediaAspectStateRepository(db),
    contentRating:
      partial?.contentRating ?? makeMediaContentRatingRepository(db),
    extras: partial?.extras ?? makeMediaExtrasRepository(db),
    tmdb: partial?.tmdb ?? (await getTmdbProvider()),
    tvdb: partial?.tvdb ?? (await getTvdbProvider()),
    logger: partial?.logger ?? makeConsoleLogger(),
  };
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
