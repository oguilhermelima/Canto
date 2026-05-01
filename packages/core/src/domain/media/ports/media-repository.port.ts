import type {
  Episode,
  EpisodeNumberRef,
  EpisodePatch,
  NewEpisode,
} from "@canto/core/domain/media/types/episode";
import type {
  DownloadedLibraryMedia,
  EnrichmentEligibility,
  EnrichmentEligibilityFilter,
  LibraryExternalIdRef,
  LibraryMediaBrief,
  LibraryMediaPage,
  LibraryStats,
  Media,
  MediaProvider,
  MediaType,
  MonitoredShowForRss,
  NewMedia,
  UpdateMediaInput,
} from "@canto/core/domain/media/types/media";
import type { ListInput } from "@canto/validators";
import type {
  NewSeason,
  Season,
  SeasonWithEpisodes,
} from "@canto/core/domain/media/types/season";

/**
 * Single port covering the media-context core tables — `media`, `season`,
 * `episode`. Wave 9A scope: every operation that touches *only* those three
 * tables surfaces here. Reads that JOIN with localization
 * (`media_localization`, `season_localization`, `episode_localization`) or
 * cadence state (`media_aspect_state`) intentionally stay direct in
 * `infra/media/*-repository.ts` — those land in Wave 9B.
 *
 * Cross-context operations that the existing `media-repository.ts` happens
 * to host (e.g. `findLibraryStats` joining `media_file`, `isMediaOrphaned`
 * checking `media_version` + `download`) are surfaced here as bridge
 * helpers — the underlying queries cross context boundaries but the
 * composition root is media. They're tagged in the adapter with TODO
 * comments noting the eventual home.
 */
export interface MediaRepositoryPort {
  // ─── Reads (single row) ───

  findById(id: string): Promise<Media | null>;
  findByIdWithSeasons(id: string): Promise<
    | (Media & {
        seasons: SeasonWithEpisodes[];
      })
    | null
  >;
  findByExternalId(
    externalId: number,
    provider: MediaProvider,
    type?: MediaType,
  ): Promise<(Media & { seasons: SeasonWithEpisodes[] }) | null>;
  /**
   * Cross-reference resolver: tries direct (externalId+provider) first, then
   * falls back to imdbId, then tvdbId, then provider-specific reverse lookups.
   * Returns the row with seasons inlined (matches `findByIdWithSeasons` shape)
   * so the TVDB-replacement flow can decide structure-migration from the same
   * read. Used heavily by reverse-sync, Trakt sync, and the TVDB toggle.
   */
  findByAnyReference(
    externalId: number,
    provider: MediaProvider,
    imdbId?: string,
    tvdbId?: number,
    type?: MediaType,
  ): Promise<(Media & { seasons: SeasonWithEpisodes[] }) | null>;

  // ─── Writes (media) ───

  /**
   * Insert a new media row. Returns the inserted entity. Does NOT handle
   * conflict resolution — callers that need cross-reference dedup should
   * resolve via `findByAnyReference` first. Localization writes (en-US row
   * etc.) are NOT performed here — they're the caller's responsibility
   * (Wave 9B will absorb these into a higher-level use case).
   */
  createMedia(input: NewMedia): Promise<Media>;

  /**
   * Insert with conflict-skip semantics. Returns the inserted row, or
   * `null` when an existing row collides on the unique constraint
   * `(externalId, provider, type)`. Used by the persist pipeline so the
   * caller can re-resolve the conflicting row and update it.
   */
  tryCreateMedia(input: NewMedia): Promise<Media | null>;

  /**
   * Update an existing media row. The adapter bumps `updatedAt` for you;
   * pass only the columns you want changed.
   */
  updateMedia(id: string, input: UpdateMediaInput): Promise<Media | null>;

  /** Hard delete. Cascades to `season` → `episode` via FK. Used by the
   *  orphan GC in `resolve-media-version`. */
  deleteMedia(id: string): Promise<void>;

  /**
   * True when the media has at least one season with `seasonType IN
   * ('official', 'default')` — the marker the persist pipeline uses to
   * detect TVDB-reconciled structure and skip the TMDB season upsert.
   */
  hasTvdbReconciledStructure(mediaId: string): Promise<boolean>;

  // ─── Library projections ───

  /** Tiny projection: every media in the user library, externalId+provider
   *  only. Recommendation seeds + reverse-sync exclusion lists hit this. */
  findLibraryExternalIds(): Promise<LibraryExternalIdRef[]>;

  /** Tiny projection with id+type. Capped at `limit` (default 100). */
  findLibraryMediaBrief(limit?: number): Promise<LibraryMediaBrief[]>;

  /** Aggregate row counts + storage bytes. Storage scan crosses into
   *  `media_file` (Wave 8 territory) — surfaced here because the read is
   *  composed at the media context boundary. */
  findLibraryStats(): Promise<LibraryStats>;

  /** Show ids currently in the user library. Used by `toggle-tvdb-default`
   *  to fan out structure refreshes. */
  findShowIdsInLibrary(): Promise<string[]>;

  /**
   * Paginated + filtered library listing, with the user-language localization
   * overlay applied inline (LEFT JOIN on `media_localization` with COALESCE
   * en-US fallback). Mirrors the legacy `listLibraryMedia` infra helper.
   *
   * When `userId` is supplied, results are restricted to media that has at
   * least one `media_version` row from a server the user has connected to.
   * Used by the library tRPC route and the mobile library tab.
   */
  listLibraryMedia(
    input: ListInput,
    language: string,
    userId?: string,
  ): Promise<LibraryMediaPage>;

  /**
   * Shows marked for continuous-download RSS monitoring. Tiny projection
   * keyed off the en-US localization (release-group titles match the
   * canonical English title). Used by the `rss-sync` worker job.
   */
  findMonitoredShowsForRss(): Promise<MonitoredShowForRss[]>;

  /**
   * Library media flagged as `downloaded = true` plus their en-US titles.
   * Drives the `validate-downloads` worker job — file-system presence
   * checks and human-readable failure messages.
   */
  findDownloadedLibraryMedia(): Promise<DownloadedLibraryMedia[]>;

  /**
   * Enumerate media rows eligible for the `ensureMediaMany` orchestrator
   * to iterate over. Returns the minimum set of columns the gap-detection
   * loop needs (`id` / `type` / `tvdbId`) — every other column the
   * orchestrator might want goes through `detectGaps` per-row.
   */
  findEligibleForEnrichment(
    filter: EnrichmentEligibilityFilter,
  ): Promise<EnrichmentEligibility[]>;

  // ─── Cross-context bridges ───

  /**
   * True when a media has zero remaining `media_version` rows AND no
   * `download` rows referencing it. Used by `resolve-media-version`'s GC.
   * Crosses into Wave 8 territory; left here because the orphan check is
   * conceptually a property of the media row itself.
   *
   * @param excludeVersionId optional version id to ignore in the count
   *   (used when checking pre-deletion).
   */
  isMediaOrphaned(mediaId: string, excludeVersionId?: string): Promise<boolean>;

  // ─── Season reads ───

  /** Read every season for a media, episodes inlined and sorted. */
  findSeasonsByMediaId(mediaId: string): Promise<SeasonWithEpisodes[]>;

  /** Number of season rows persisted for a media — drives the gap detector
   *  without pulling episode payloads. */
  countSeasonsByMediaId(mediaId: string): Promise<number>;

  /** Number of episode rows for a media (joined via season). */
  countEpisodesByMediaId(mediaId: string): Promise<number>;

  // ─── Episode reads ───

  /**
   * Resolve an internal episode id from `(mediaId, seasonNumber, episodeNumber)`.
   * Used by Trakt sync, playback push, and download resolution to translate
   * provider-shaped tuples into our internal ids.
   */
  findEpisodeIdByMediaAndNumbers(
    mediaId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<string | null>;

  /** Reverse lookup: from an episode id, return the `(seasonNumber,
   *  episodeNumber)` pair. */
  findEpisodeNumbersById(episodeId: string): Promise<EpisodeNumberRef | null>;

  // ─── Season / Episode writes ───
  //
  // The full normalize-then-persist pipeline (TMDB / TVDB-shaped payloads →
  // row inserts with on-conflict upserts, TVDB-overlay, episode patches)
  // lives in `domain/media/use-cases/persist/*` and is **not** ported in
  // Wave 9A — those callers cross into localization (Wave 9B) and extras
  // (Wave 9C). The minimal CRUD below covers the structure-only paths the
  // Wave 9A use cases need; Wave 9B will extend.

  createSeason(input: NewSeason): Promise<Season>;
  /** Upsert by `(mediaId, number)` — the table's unique constraint. */
  upsertSeason(input: NewSeason): Promise<Season>;

  createEpisode(input: NewEpisode): Promise<Episode>;
  /** Upsert by `(seasonId, number)` — the table's unique constraint. */
  upsertEpisode(input: NewEpisode): Promise<Episode>;
  /** Apply a partial patch to an existing episode (TMDB still / vote
   *  overlay onto a TVDB-sourced row, etc.). */
  patchEpisode(id: string, patch: EpisodePatch): Promise<Episode | null>;

  /**
   * Bulk insert episodes, skipping any row whose `(seasonId, number)`
   * already exists. Used when a season is freshly inserted and the
   * episode payload is known to be unique to it; conflicts on a re-run
   * are silent so the operation stays idempotent.
   */
  bulkCreateEpisodesIgnoringConflicts(rows: NewEpisode[]): Promise<void>;
}
