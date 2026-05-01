import type { Database } from "@canto/db/client";
import type { ProviderName } from "@canto/providers";

import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { TvdbOverlayRepositoryPort } from "@canto/core/domain/media/ports/tvdb-overlay-repository.port";
import type {
  Aspect,
  EnsureMediaResult,
  EnsureMediaSpec,
} from "@canto/core/domain/media/use-cases/ensure-media.types";
import type { CadenceMediaRow } from "@canto/core/domain/media/use-cases/cadence/aspect-state-writer";
import type { Outcome } from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";
import type { MediaMetadata } from "@canto/core/domain/media/use-cases/fetch-media-metadata";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";

/**
 * Provider-shaped capability tags. The orchestrator coalesces strategies by
 * `needs` so a single provider call can satisfy several aspects.
 *
 * `tmdb.metadata` is the only capability that the orchestrator pre-fetches and
 * shares — every other capability is self-fetched by its strategy because
 * either (a) the call is per-scope (logos, episode translations) or (b) the
 * existing helper already encapsulates the fetch (extras, refresh-extras
 * reuses the cross-provider IMDB fallback).
 */
export type ApiCapability =
  | "tmdb.metadata"
  | "tmdb.extras"
  | "tmdb.images"
  | "tvdb.metadata"
  | "tvdb.episodeTranslations";

/**
 * Full media row fields strategies actually read. Wider than `CadenceMediaRow`
 * (which only models scheduling-relevant columns) because strategies need
 * provider/external identity to dispatch their inline calls.
 *
 * Note: title is no longer carried on the media row after Phase 1C-δ; readers
 * that need a display title should look it up via the localization service.
 */
export interface EnrichmentMediaRow extends CadenceMediaRow {
  id: string;
  externalId: number;
  tvdbId: number | null;
  imdbId: string | null;
}

/**
 * Repository ports + provider clients made available to every strategy.
 * Threaded through `EnrichmentCtx.deps` so strategies don't need to call
 * `makeXxxRepository(db)` themselves — the orchestrator builds the deps
 * once at the top of `ensureMedia` and shares the same instances.
 */
export interface EnrichmentDeps {
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  tvdbOverlay: TvdbOverlayRepositoryPort;
  tmdb: MediaProviderPort;
  tvdb: MediaProviderPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
  userPrefs: UserPreferencesPort;
}

/**
 * Per-run context handed to every strategy. Includes the resolved effective
 * provider, the language fan-out the orchestrator decided to honour, and a
 * mutable result accumulator so strategies can record provider-call counts +
 * write counts in one place.
 */
export interface EnrichmentCtx {
  mediaRow: EnrichmentMediaRow;
  effectiveProvider: ProviderName;
  languages: string[];
  /** Translation scopes the cadence engine selected for this run. */
  planTranslationLangs: string[];
  /** Logo scopes the cadence engine selected for this run. */
  planLogoLangs: string[];
  spec: EnsureMediaSpec;
  /** Mutable accumulator. Strategies bump the relevant counter. */
  result: EnsureMediaResult;
  /**
   * Strategy-private scratch space — used by strategies that fire a single
   * provider call covering multiple scopes (e.g. logos) to memoize the
   * outcome between sibling-scope invocations.
   */
  scratch: Record<string, unknown>;
  /** Repository ports + providers shared across the run. */
  deps: EnrichmentDeps;
}

export interface ApplyArgs<TResponse = unknown> {
  db: Database;
  mediaId: string;
  scope: string;
  ctx: EnrichmentCtx;
  /**
   * Shared response from `fireCall(strategy.needs)`. `undefined` for
   * capabilities that are self-fetched per strategy (extras, logos, etc.).
   */
  response: TResponse;
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort };
}

/**
 * The shared `tmdb.metadata` response wires the metadata + structure +
 * translations + contentRatings strategies together. Re-exporting under a
 * stable alias keeps strategy signatures readable.
 */
export type SharedMetadataResponse = MediaMetadata;

export interface MediaEnrichmentStrategy<TResponse = unknown> {
  /** The aspect this strategy is responsible for. */
  aspect: Aspect;
  /**
   * Other aspects that must execute first. Drives the orchestrator's topo
   * sort. Empty array = root.
   */
  dependsOn: readonly Aspect[];
  /**
   * Which provider call covers this strategy. Strategies sharing the same
   * `needs` reuse a single response.
   */
  needs: ApiCapability;
  /**
   * Apply the strategy to a single (aspect, scope) tuple. Returns the
   * cadence outcome to record. Throwing is acceptable — the orchestrator
   * classifies the error via `classifyError`.
   */
  applyToAspect(args: ApplyArgs<TResponse>): Promise<Outcome>;
}
