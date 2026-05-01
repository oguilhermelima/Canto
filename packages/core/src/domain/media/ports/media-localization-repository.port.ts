import type {
  EpisodeLocalizationPayload,
  ExternalMediaRef,
  LocaleCode,
  LocalizationSource,
  LocalizedEpisode,
  LocalizedMedia,
  LocalizedSeason,
  MediaLocalization,
  MediaLocalizationPayload,
  SeasonLocalizationPayload,
} from "@canto/core/domain/media/types/media-localization";

/**
 * Port for the per-language storage that drives every user-facing read of
 * `title`/`overview`/`tagline`/`posterPath`/`logoPath`/`trailerKey`. Wave 9B
 * scope: every operation that touches `media_localization`,
 * `season_localization`, or `episode_localization` flows through this port —
 * the cross-context overlay helpers (`applyMediaLocalizationOverlay`,
 * `applySeasonsLocalizationOverlay`) compose on top.
 *
 * The reads return `LocalizedMedia[]` / `LocalizedSeason[]` /
 * `LocalizedEpisode[]` shapes that JOIN the structural columns from `media`
 * with the COALESCE'd user-lang/en-US localization columns. The writes work
 * at the canonical row level (one `media_localization` row per
 * `(mediaId, language)` tuple) and apply COALESCE-style merging so partial
 * updates never blow away previously-stored fields.
 */
export interface MediaLocalizationRepositoryPort {
  // ─── Reads (single row, raw localization) ───

  /** Read the raw `media_localization` row for a `(mediaId, language)`
   *  tuple. Returns `null` when no row exists for that pair. */
  findOne(
    mediaId: string,
    language: LocaleCode,
  ): Promise<MediaLocalization | null>;

  /** Read every localization row for a media (every language). Used by the
   *  enrichment gap detector to figure out which languages still need
   *  fetching. */
  findAllForMedia(mediaId: string): Promise<MediaLocalization[]>;

  // ─── Reads (localized projections — JOIN media + media_localization) ───

  /**
   * Single localized media projection — id-keyed lookup. The shape is the
   * structural columns from `media` plus the COALESCE'd user-lang/en-US
   * localization. Used by detail readers and overlay helpers.
   */
  findLocalizedById(
    mediaId: string,
    language: LocaleCode,
  ): Promise<LocalizedMedia | null>;

  /** External-key sibling of `findLocalizedById`. Resolves
   *  `(externalId, provider, type)` — used by paths that don't carry the
   *  internal UUID (e.g. the spotlight TMDB-trending fallback). */
  findLocalizedByExternal(
    externalId: number,
    provider: string,
    type: string,
    language: LocaleCode,
  ): Promise<LocalizedMedia | null>;

  /** Batch by id. Empty input returns an empty array. */
  findLocalizedManyByIds(
    mediaIds: string[],
    language: LocaleCode,
  ): Promise<LocalizedMedia[]>;

  /** Batch by external triple. Empty input returns an empty array. */
  findLocalizedManyByExternal(
    refs: ExternalMediaRef[],
    language: LocaleCode,
  ): Promise<LocalizedMedia[]>;

  // ─── Logo overlay (browse-time) ───

  /**
   * Batch logo lookup keyed off `(externalId, provider, type)` triples,
   * with the user-language COALESCE applied. Used by the browse-time logo
   * enrichment path (`fetch-logos`) to figure out which items already
   * have a localized logo persisted vs. which still need a TMDB roundtrip.
   *
   * Returns one row per matched media; `logoPath` is the COALESCE
   * (user-lang → en-US) result, while `translatedLogoPath` is the raw
   * user-language column so callers can detect "we already have a
   * localized logo" without re-querying.
   */
  findLogoOverlayByExternalRefs(
    refs: ExternalMediaRef[],
    language: LocaleCode,
  ): Promise<
    Array<{
      id: string;
      externalId: number;
      type: string;
      logoPath: string | null;
      translatedLogoPath: string | null;
    }>
  >;

  // ─── Reads (season / episode localization) ───

  /** All seasons for a media with the user-lang COALESCE applied. */
  findLocalizedSeasonsByMedia(
    mediaId: string,
    language: LocaleCode,
  ): Promise<LocalizedSeason[]>;

  /** All episodes for a season with the user-lang COALESCE applied. */
  findLocalizedEpisodesBySeason(
    seasonId: string,
    language: LocaleCode,
  ): Promise<LocalizedEpisode[]>;

  // ─── Writes (media localization) ───

  /**
   * Upsert a single media-localization row by `(mediaId, language)`. Existing
   * non-null fields are preserved unless the payload supplies a non-null
   * value (COALESCE merge). `source` is overwritten on every write so the
   * row always reflects the latest provider that touched it.
   */
  upsertMediaLocalization(
    mediaId: string,
    language: LocaleCode,
    payload: MediaLocalizationPayload,
    source: LocalizationSource,
  ): Promise<void>;

  // ─── Writes (season / episode localization) ───

  upsertSeasonLocalization(
    seasonId: string,
    language: LocaleCode,
    payload: SeasonLocalizationPayload,
    source: LocalizationSource,
  ): Promise<void>;

  upsertEpisodeLocalization(
    episodeId: string,
    language: LocaleCode,
    payload: EpisodeLocalizationPayload,
    source: LocalizationSource,
  ): Promise<void>;

  // ─── Gap detection ───

  /**
   * Per-language presence count for the media + (optional) season + episode
   * localization tables. Returns one entry per requested language with the
   * count of rows present (media is 0 or 1; season/episode is 0..N). The
   * en-US baseline is excluded from the counts so callers can compare to the
   * structure totals without subtracting it.
   */
  countTranslationsPerLanguage(
    mediaId: string,
    languages: LocaleCode[],
    includeStructure: boolean,
  ): Promise<
    Record<string, { media: number; season: number; episode: number }>
  >;

  /** Distinct non-en-US languages that already have a logoPath persisted on
   *  the media-localization table. */
  findLogoLanguagesByMediaId(mediaId: string): Promise<string[]>;
}
