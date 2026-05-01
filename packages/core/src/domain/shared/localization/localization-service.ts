import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type {
  EpisodeLocalizationPayload,
  LocalizationSource,
  LocalizedEpisode,
  LocalizedMedia,
  LocalizedSeason,
  MediaLocalizationPayload,
  SeasonLocalizationPayload,
} from "@canto/core/domain/shared/localization/types";

/**
 * Deps bag every overlay helper accepts. Wave 9C2 routed the overlay reads
 * through the localization port — callers either build it once at the entry
 * edge via `makeMediaLocalizationRepository(db)` or thread it down through
 * a higher-level deps interface (`PersistDeps.localization` etc).
 */
export interface LocalizationOverlayDeps {
  localization: MediaLocalizationRepositoryPort;
}

export async function resolveLocalizedMedia(
  deps: LocalizationOverlayDeps,
  mediaId: string,
  language: string,
): Promise<LocalizedMedia | null> {
  return deps.localization.findLocalizedById(mediaId, language);
}

export async function resolveLocalizedMediaByExternal(
  deps: LocalizationOverlayDeps,
  externalId: number,
  provider: string,
  type: string,
  language: string,
): Promise<LocalizedMedia | null> {
  return deps.localization.findLocalizedByExternal(
    externalId,
    provider,
    type,
    language,
  );
}

export async function resolveLocalizedMediaMany(
  deps: LocalizationOverlayDeps,
  mediaIds: string[],
  language: string,
): Promise<LocalizedMedia[]> {
  return deps.localization.findLocalizedManyByIds(mediaIds, language);
}

/**
 * Batch resolve localized rows by `(externalId, provider, type)`. Used when
 * callers carry the external identifier instead of the internal media UUID
 * (e.g. spotlight TMDB-trending fallback items built directly off provider
 * responses).
 */
export async function resolveLocalizedMediaByExternalMany(
  deps: LocalizationOverlayDeps,
  refs: Array<{ externalId: number; provider: string; type: string }>,
  language: string,
): Promise<LocalizedMedia[]> {
  return deps.localization.findLocalizedManyByExternal(refs, language);
}

export async function resolveLocalizedSeasons(
  deps: LocalizationOverlayDeps,
  mediaId: string,
  language: string,
): Promise<LocalizedSeason[]> {
  return deps.localization.findLocalizedSeasonsByMedia(mediaId, language);
}

export async function resolveLocalizedEpisodes(
  deps: LocalizationOverlayDeps,
  seasonId: string,
  language: string,
): Promise<LocalizedEpisode[]> {
  return deps.localization.findLocalizedEpisodesBySeason(seasonId, language);
}

export async function upsertMediaLocalization(
  deps: LocalizationOverlayDeps,
  mediaId: string,
  language: string,
  payload: MediaLocalizationPayload,
  source: LocalizationSource,
): Promise<void> {
  await deps.localization.upsertMediaLocalization(
    mediaId,
    language,
    payload,
    source,
  );
}

export async function upsertSeasonLocalization(
  deps: LocalizationOverlayDeps,
  seasonId: string,
  language: string,
  payload: SeasonLocalizationPayload,
  source: LocalizationSource,
): Promise<void> {
  await deps.localization.upsertSeasonLocalization(
    seasonId,
    language,
    payload,
    source,
  );
}

export async function upsertEpisodeLocalization(
  deps: LocalizationOverlayDeps,
  episodeId: string,
  language: string,
  payload: EpisodeLocalizationPayload,
  source: LocalizationSource,
): Promise<void> {
  await deps.localization.upsertEpisodeLocalization(
    episodeId,
    language,
    payload,
    source,
  );
}

// ─── Overlay helpers (drop-in replacements for legacy translation-service) ───

export interface OverlayableMedia {
  id: string;
  // Title/overview/tagline/posterPath/logoPath now live exclusively on
  // `media_localization` — overlay reads them from there. Inputs may carry
  // stale copies (legacy callers) but the overlay always sources from the
  // localized row.
  title?: string | null;
  overview?: string | null;
  tagline?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
}

export interface OverlayableEpisode {
  id: string;
  title: string | null;
  overview: string | null;
}

export interface OverlayableSeason {
  id: string;
  name: string | null;
  overview: string | null;
}

/**
 * Overlay localized fields onto a media row, reading from `media_localization`
 * with en-US fallback. Preserves every other column on the row. Drop-in
 * replacement for the legacy `applyMediaTranslation` helper but routed through
 * the unified localization read path.
 *
 * After Phase 1C-δ the base `media` row no longer carries title/overview/
 * tagline/posterPath/logoPath — the overlay is the canonical reader for those
 * fields. When no localization row exists (theoretically only possible for
 * unpersisted media), the original row is returned unchanged.
 */
export async function applyMediaLocalizationOverlay<T extends OverlayableMedia>(
  row: T,
  language: string,
  deps: LocalizationOverlayDeps,
): Promise<T & {
  title: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  logoPath: string | null;
}> {
  const loc = await deps.localization.findLocalizedById(row.id, language);
  const overlay = loc
    ? {
        title: loc.title,
        overview: loc.overview,
        tagline: loc.tagline,
        posterPath: loc.posterPath,
        logoPath: loc.logoPath,
      }
    : {
        title: row.title ?? "",
        overview: row.overview ?? null,
        tagline: row.tagline ?? null,
        posterPath: row.posterPath ?? null,
        logoPath: row.logoPath ?? null,
      };
  return { ...row, ...overlay };
}

export interface OverlayableMediaItem {
  id?: string | null;
  /**
   * External identifier triple — used as a fallback lookup key when `id` is
   * missing. The spotlight TMDB-trending fallback (and any other path that
   * builds items straight off provider responses without first persisting
   * them) carries these instead of the internal UUID.
   */
  externalId?: number | null;
  provider?: string | null;
  type?: string | null;
  title?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
}

/**
 * Overlay localized fields onto a flat list of media items, reading from
 * `media_localization` with en-US fallback in a single batch query. Items
 * are looked up by `id` when present; items lacking `id` but carrying
 * `(externalId, provider, type)` are looked up via the external-key index.
 * Items with neither pass through unchanged (TMDB-only items not in our
 * DB). Drop-in replacement for the legacy `translateMediaItems` helper.
 */
export async function applyMediaItemsLocalizationOverlay<
  T extends OverlayableMediaItem,
>(items: T[], language: string, deps: LocalizationOverlayDeps): Promise<T[]> {
  if (items.length === 0) return items;

  const ids = items
    .map((i) => i.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const externalRefs = items
    .filter(
      (i) =>
        (typeof i.id !== "string" || i.id.length === 0) &&
        typeof i.externalId === "number" &&
        typeof i.provider === "string" &&
        typeof i.type === "string",
    )
    .map((i) => ({
      externalId: i.externalId as number,
      provider: i.provider as string,
      type: i.type as string,
    }));

  const [byId, byExternal] = await Promise.all([
    ids.length > 0
      ? deps.localization.findLocalizedManyByIds(ids, language)
      : Promise.resolve([] as LocalizedMedia[]),
    externalRefs.length > 0
      ? deps.localization.findLocalizedManyByExternal(externalRefs, language)
      : Promise.resolve([] as LocalizedMedia[]),
  ]);

  const locById = new Map(byId.map((l) => [l.id, l]));
  // External key follows the same `${provider}-${type}-${externalId}` shape
  // used elsewhere (fetch-logos, spotlight-source) so the lookup composes
  // cleanly with existing call sites.
  const locByExternalKey = new Map(
    byExternal.map((l) => [
      `${l.provider}-${l.type}-${l.externalId}`,
      l,
    ]),
  );

  return items.map((item) => {
    let loc: LocalizedMedia | undefined;
    if (item.id) {
      loc = locById.get(item.id);
    } else if (
      typeof item.externalId === "number" &&
      typeof item.provider === "string" &&
      typeof item.type === "string"
    ) {
      loc = locByExternalKey.get(
        `${item.provider}-${item.type}-${item.externalId}`,
      );
    }
    if (!loc) {
      return {
        ...item,
        title: item.title ?? "",
        overview: item.overview ?? null,
        posterPath: item.posterPath ?? null,
        logoPath: item.logoPath ?? null,
      } as T;
    }
    return {
      ...item,
      title: loc.title,
      overview: loc.overview,
      posterPath: loc.posterPath,
      logoPath: loc.logoPath,
    } as T;
  });
}

/**
 * Overlay localized name/overview onto seasons + localized title/overview
 * onto each season's episodes. Drop-in replacement for the legacy
 * `applySeasonsTranslation` helper.
 *
 * Issues 1 query for season localizations + 1 query per season for episode
 * localizations (parallel via `Promise.all`). Matches the migration pattern
 * documented in Phase 1C-β.
 */
export async function applySeasonsLocalizationOverlay<
  E extends OverlayableEpisode,
  S extends OverlayableSeason & { episodes: E[] },
>(
  mediaId: string,
  seasons: S[],
  language: string,
  deps: LocalizationOverlayDeps,
): Promise<S[]> {
  if (seasons.length === 0) return seasons;

  const [localizedSeasons, episodeLocsPerSeason] = await Promise.all([
    deps.localization.findLocalizedSeasonsByMedia(mediaId, language),
    Promise.all(
      seasons.map((s) =>
        deps.localization.findLocalizedEpisodesBySeason(s.id, language),
      ),
    ),
  ]);

  const seasonLocById = new Map(localizedSeasons.map((s) => [s.id, s]));

  return seasons.map((s, idx) => {
    const seasonLoc = seasonLocById.get(s.id);
    const epLocs = episodeLocsPerSeason[idx] ?? [];
    const epLocById = new Map(epLocs.map((e) => [e.id, e]));

    const newEpisodes = s.episodes.map((e) => {
      const epLoc = epLocById.get(e.id);
      if (!epLoc) return e;
      return { ...e, title: epLoc.title, overview: epLoc.overview };
    });

    if (!seasonLoc) {
      return { ...s, episodes: newEpisodes };
    }
    return {
      ...s,
      name: seasonLoc.name,
      overview: seasonLoc.overview,
      episodes: newEpisodes,
    };
  });
}
