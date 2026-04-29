import type { Database } from "@canto/db/client";
import type { ProviderName } from "@canto/providers";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import type {
  Aspect,
  EnsureMediaResult,
  EnsureMediaSpec,
} from "../use-cases/ensure-media.types";
import type {
  CadenceMediaRow,
  Outcome,
} from "../use-cases/cadence";
import type { MediaMetadata } from "../use-cases/fetch-media-metadata";

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
 */
export interface EnrichmentMediaRow extends CadenceMediaRow {
  id: string;
  externalId: number;
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
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
