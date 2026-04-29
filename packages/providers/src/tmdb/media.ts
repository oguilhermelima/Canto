import type {
  CastMember,
  CrewMember,
  EpisodeTranslation,
  MediaExtras,
  MediaType,
  MetadataOpts,
  NormalizedMedia,
  NormalizedSeason,
  SearchOpts,
  SearchResult,
  SeasonTranslation,
  Translation,
  Video,
} from "../types";
import {
  normalizeWatchProviders,
  TmdbClient,
  yearFromDate,
  type TmdbCollection,
  type TmdbContentRating,
  type TmdbGenre,
  type TmdbImage,
  type TmdbNetwork,
  type TmdbProductionCompany,
  type TmdbReleaseDate,
} from "./client";
import { normalizeSeason } from "./season";

/* -------------------------------------------------------------------------- */
/*  Search result normalization (shared by search/find/discover)              */
/* -------------------------------------------------------------------------- */

export function normalizeSearchResult(
  raw: unknown,
  type: MediaType,
): SearchResult {
  const data = raw as Record<string, unknown>;
  const isMovie = type === "movie";

  const title = isMovie
    ? ((data.title as string) ?? "")
    : ((data.name as string) ?? "");
  const originalTitle = isMovie
    ? ((data.original_title as string) ?? undefined)
    : ((data.original_name as string) ?? undefined);
  const releaseDate = isMovie
    ? ((data.release_date as string) ?? undefined)
    : ((data.first_air_date as string) ?? undefined);

  return {
    externalId: data.id as number,
    provider: "tmdb",
    type,
    title,
    originalTitle,
    overview: (data.overview as string) ?? undefined,
    posterPath: (data.poster_path as string | null) ?? undefined,
    backdropPath: (data.backdrop_path as string | null) ?? undefined,
    releaseDate,
    year: yearFromDate(releaseDate),
    voteAverage: (data.vote_average as number) ?? undefined,
    voteCount: (data.vote_count as number) ?? undefined,
    popularity: (data.popularity as number) ?? undefined,
    genreIds: (data.genre_ids as number[]) ?? undefined,
    originalLanguage: (data.original_language as string) ?? undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*  Translations                                                              */
/* -------------------------------------------------------------------------- */

function parseTranslations(data: Record<string, unknown>): Translation[] {
  const translationsData = data.translations as
    | {
        translations?: Array<{
          iso_639_1: string;
          iso_3166_1: string;
          data: {
            title?: string;
            name?: string;
            overview?: string;
            tagline?: string;
          };
        }>;
      }
    | undefined;

  if (!translationsData?.translations) return [];

  return translationsData.translations
    .filter((t) => t.data.title || t.data.name || t.data.overview)
    .map((t) => ({
      language: `${t.iso_639_1}-${t.iso_3166_1}`,
      title: t.data.title || t.data.name,
      overview: t.data.overview,
      tagline: t.data.tagline,
    }));
}

/**
 * Enrich Translation[] with per-language poster/logo paths from the images response.
 * TMDB returns images with iso_639_1 tags — we pick the best (highest vote_average) per language.
 */
function enrichTranslationsWithImages(
  translations: Translation[],
  data: Record<string, unknown>,
): void {
  const imagesData = data.images as
    | {
        posters?: Array<{
          file_path: string;
          iso_639_1: string | null;
          vote_average: number;
        }>;
        logos?: Array<{
          file_path: string;
          iso_639_1: string | null;
          vote_average: number;
        }>;
      }
    | undefined;

  if (!imagesData) return;

  // Best poster per language (by vote_average)
  const bestPoster = new Map<string, string>();
  const bestPosterScore = new Map<string, number>();
  for (const p of imagesData.posters ?? []) {
    const langCode = p.iso_639_1;
    if (!langCode || langCode === "en") continue; // skip English (base)
    const cur = bestPosterScore.get(langCode) ?? -1;
    if (p.vote_average > cur) {
      bestPoster.set(langCode, p.file_path);
      bestPosterScore.set(langCode, p.vote_average);
    }
  }

  // Best logo per language (by vote_average)
  const bestLogo = new Map<string, string>();
  const bestLogoScore = new Map<string, number>();
  for (const l of imagesData.logos ?? []) {
    const langCode = l.iso_639_1;
    if (!langCode || langCode === "en") continue;
    const cur = bestLogoScore.get(langCode) ?? -1;
    if (l.vote_average > cur) {
      bestLogo.set(langCode, l.file_path);
      bestLogoScore.set(langCode, l.vote_average);
    }
  }

  // Match translations to images by exact iso_639_1 tag only. TMDB tags images
  // with the 2-letter code regardless of region (pt-BR uploads share "pt" with
  // pt-PT), so falling back to the short prefix would conflate regional variants
  // and assign pt-PT visuals to pt-BR translations. Posters are disambiguated
  // via the per-locale endpoint in `enrichTranslationsWithLocalePoster`; logos
  // have no equivalent endpoint and fall back to the base English logo.
  for (const t of translations) {
    const poster = bestPoster.get(t.language);
    const logo = bestLogo.get(t.language);
    if (poster) t.posterPath = poster;
    if (logo) t.logoPath = logo;
  }
}

/**
 * Resolve region-specific posters for every supported regional locale.
 *
 * TMDB tags images by iso_639_1 only (2 letters), so `enrichTranslationsWithImages`
 * cannot disambiguate pt-BR vs pt-PT (both share the "pt" tag). We hit the
 * per-locale endpoint here to pick the regional poster directly — TMDB returns
 * the correct localized `poster_path` when queried with the full locale.
 *
 * Gated on prefixes that already have at least one tagged poster from path 1
 * to avoid TMDB's bad fallback: `/tv/{id}?language=X` returns the show's
 * *original-language* poster when no localized poster exists (e.g. Japanese
 * for an anime queried with pt-BR). When path 1 found something, we know a
 * Portuguese poster exists, so per-locale fetch returns the correct regional
 * variant — never the original-language fallback.
 */
async function enrichTranslationsWithLocalePoster(
  client: TmdbClient,
  translations: Translation[],
  endpoint: string,
  supportedLangs: string[],
): Promise<void> {
  const byPrefix = new Map<string, string[]>();
  for (const lang of supportedLangs) {
    if (lang.startsWith("en")) continue;
    const prefix = lang.split("-")[0]!;
    const list = byPrefix.get(prefix) ?? [];
    list.push(lang);
    byPrefix.set(prefix, list);
  }

  // Prefixes where path 1 (tagged-image match) found a poster — safe to disambiguate.
  const prefixesWithPoster = new Set<string>();
  for (const t of translations) {
    if (t.posterPath) prefixesWithPoster.add(t.language.split("-")[0]!);
  }

  const langsToFetch = new Set<string>();
  for (const [prefix, langs] of byPrefix) {
    if (prefixesWithPoster.has(prefix)) {
      for (const l of langs) langsToFetch.add(l);
    }
  }

  if (langsToFetch.size === 0) return;

  await Promise.allSettled(
    [...langsToFetch].map(async (lang) => {
      const trans = translations.find((t) => t.language === lang);
      if (!trans) return;
      try {
        const data = await client.fetch<Record<string, unknown>>(endpoint, {
          language: lang,
        });
        const poster = data.poster_path as string | null;
        if (poster) trans.posterPath = poster;
      } catch {
        // Skip — keep the generic poster from images response
      }
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*  Movie / Show normalization                                                */
/* -------------------------------------------------------------------------- */

function normalizeMovie(data: Record<string, unknown>): NormalizedMedia {
  const rawGenres = (data.genres ?? []) as TmdbGenre[];
  const genres = rawGenres.map((g) => g.name);
  const genreIds = rawGenres.map((g) => g.id);

  // Extract content ratings per region from release_dates. For each region we
  // pick the first non-empty certification across the release-date entries
  // (TMDB sometimes emits multiple per region for different release types).
  const contentRatings: Array<{ region: string; rating: string }> = [];
  const releaseDates = data.release_dates as
    | { results?: TmdbReleaseDate[] }
    | undefined;
  if (releaseDates?.results) {
    for (const r of releaseDates.results) {
      const cert = r.release_dates.find(
        (rd) => rd.certification && rd.certification.length > 0,
      );
      if (cert) contentRatings.push({ region: r.iso_3166_1, rating: cert.certification });
    }
  }
  const contentRating = contentRatings.find((c) => c.region === "US")?.rating;

  // Extract logo from images
  let logoPath: string | undefined;
  const images = data.images as { logos?: TmdbImage[] } | undefined;
  if (images?.logos && images.logos.length > 0) {
    // Prefer English logos, then null (no language), sorted by vote
    const enLogos = images.logos.filter(
      (l) => l.iso_639_1 === "en" || l.iso_639_1 === null,
    );
    const sorted = enLogos.sort((a, b) => b.vote_average - a.vote_average);
    logoPath = sorted[0]?.file_path ?? images.logos[0]?.file_path;
  }

  // External IDs
  const externalIds = data.external_ids as
    | { imdb_id?: string; tvdb_id?: number }
    | undefined;

  // Production companies
  const rawCompanies = (data.production_companies ??
    []) as TmdbProductionCompany[];
  const productionCompanies = rawCompanies.map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? undefined,
  }));

  // Production countries
  const rawCountries = (data.production_countries ?? []) as Array<{
    iso_3166_1: string;
    name: string;
  }>;
  const productionCountries = rawCountries.map((c) => c.iso_3166_1);

  // Spoken languages
  const rawLangs = (data.spoken_languages ?? []) as Array<{
    iso_639_1: string;
    name: string;
  }>;
  const spokenLanguages = rawLangs.map((l) => l.iso_639_1);

  // Origin country
  const originCountry = (data.origin_country ?? []) as string[];

  // Collection
  const rawCollection = data.belongs_to_collection as
    | TmdbCollection
    | null
    | undefined;
  const collection = rawCollection
    ? {
        id: rawCollection.id,
        name: rawCollection.name,
        posterPath: rawCollection.poster_path ?? undefined,
      }
    : null;

  const releaseDate = (data.release_date as string) ?? undefined;

  return {
    externalId: data.id as number,
    provider: "tmdb",
    type: "movie",
    title: (data.title as string) ?? "",
    originalTitle: (data.original_title as string) ?? undefined,
    overview: (data.overview as string) ?? undefined,
    tagline: (data.tagline as string) ?? undefined,
    releaseDate,
    year: yearFromDate(releaseDate),
    status: (data.status as string) ?? undefined,
    genres,
    genreIds,
    contentRating,
    contentRatings: contentRatings.length > 0 ? contentRatings : undefined,
    originalLanguage: (data.original_language as string) ?? undefined,
    spokenLanguages,
    originCountry,
    voteAverage: (data.vote_average as number) ?? undefined,
    voteCount: (data.vote_count as number) ?? undefined,
    popularity: (data.popularity as number) ?? undefined,
    runtime: (data.runtime as number) ?? undefined,
    posterPath: (data.poster_path as string | null) ?? undefined,
    backdropPath: (data.backdrop_path as string | null) ?? undefined,
    logoPath,
    imdbId: externalIds?.imdb_id ?? (data.imdb_id as string) ?? undefined,
    tvdbId: externalIds?.tvdb_id ?? undefined,
    budget: (data.budget as number) ?? undefined,
    revenue: (data.revenue as number) ?? undefined,
    collection,
    productionCompanies,
    productionCountries,
  };
}

function normalizeShow(data: Record<string, unknown>): NormalizedMedia {
  const rawGenres = (data.genres ?? []) as TmdbGenre[];
  const genres = rawGenres.map((g) => g.name);
  const genreIds = rawGenres.map((g) => g.id);

  // Extract content ratings per region (TV).
  const contentRatings: Array<{ region: string; rating: string }> = [];
  const contentRatingsRaw = data.content_ratings as
    | { results?: TmdbContentRating[] }
    | undefined;
  if (contentRatingsRaw?.results) {
    for (const r of contentRatingsRaw.results) {
      if (r.rating) contentRatings.push({ region: r.iso_3166_1, rating: r.rating });
    }
  }
  const contentRating = contentRatings.find((c) => c.region === "US")?.rating;

  // Extract logo from images
  let logoPath: string | undefined;
  const images = data.images as { logos?: TmdbImage[] } | undefined;
  if (images?.logos && images.logos.length > 0) {
    const enLogos = images.logos.filter(
      (l) => l.iso_639_1 === "en" || l.iso_639_1 === null,
    );
    const sorted = enLogos.sort((a, b) => b.vote_average - a.vote_average);
    logoPath = sorted[0]?.file_path ?? images.logos[0]?.file_path;
  }

  // External IDs
  const externalIds = data.external_ids as
    | { imdb_id?: string; tvdb_id?: number }
    | undefined;

  // Networks
  const rawNetworks = (data.networks ?? []) as TmdbNetwork[];
  const networks = rawNetworks.map((n) => n.name);

  // Production companies
  const rawCompanies = (data.production_companies ??
    []) as TmdbProductionCompany[];
  const productionCompanies = rawCompanies.map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? undefined,
  }));

  // Production countries
  const rawCountries = (data.production_countries ?? []) as Array<{
    iso_3166_1: string;
    name: string;
  }>;
  const productionCountries = rawCountries.map((c) => c.iso_3166_1);

  // Spoken languages
  const rawLangs = (data.spoken_languages ?? []) as Array<{
    iso_639_1: string;
    name: string;
  }>;
  const spokenLanguages = rawLangs.map((l) => l.iso_639_1);

  // Origin country
  const originCountry = (data.origin_country ?? []) as string[];

  // Runtime — for shows, use episode_run_time[0] or last_episode_to_air runtime
  const episodeRunTime = (data.episode_run_time ?? []) as number[];
  const runtime =
    episodeRunTime.length > 0
      ? episodeRunTime[0]
      : ((data.last_episode_to_air as Record<string, unknown> | null)?.runtime as
          | number
          | undefined) ?? undefined;

  const firstAirDate = (data.first_air_date as string) ?? undefined;
  const lastAirDate = (data.last_air_date as string) ?? undefined;

  // Seasons from the show object (light — no episodes yet)
  const rawSeasons = (data.seasons ?? []) as Array<Record<string, unknown>>;
  const seasons: NormalizedSeason[] = rawSeasons.map((s) => ({
    number: s.season_number as number,
    externalId: s.id as number,
    name: (s.name as string) ?? undefined,
    overview: (s.overview as string) ?? undefined,
    airDate: (s.air_date as string | null) ?? undefined,
    posterPath: (s.poster_path as string | null) ?? undefined,
    episodeCount: (s.episode_count as number) ?? undefined,
  }));

  return {
    externalId: data.id as number,
    provider: "tmdb",
    type: "show",
    title: (data.name as string) ?? "",
    originalTitle: (data.original_name as string) ?? undefined,
    overview: (data.overview as string) ?? undefined,
    tagline: (data.tagline as string) ?? undefined,
    releaseDate: firstAirDate,
    year: yearFromDate(firstAirDate),
    lastAirDate,
    status: (data.status as string) ?? undefined,
    genres,
    genreIds,
    contentRating,
    contentRatings: contentRatings.length > 0 ? contentRatings : undefined,
    originalLanguage: (data.original_language as string) ?? undefined,
    spokenLanguages,
    originCountry,
    voteAverage: (data.vote_average as number) ?? undefined,
    voteCount: (data.vote_count as number) ?? undefined,
    popularity: (data.popularity as number) ?? undefined,
    runtime,
    posterPath: (data.poster_path as string | null) ?? undefined,
    backdropPath: (data.backdrop_path as string | null) ?? undefined,
    logoPath,
    imdbId: externalIds?.imdb_id ?? undefined,
    tvdbId: externalIds?.tvdb_id ?? undefined,
    seasons,
    networks,
    numberOfSeasons: (data.number_of_seasons as number) ?? undefined,
    numberOfEpisodes: (data.number_of_episodes as number) ?? undefined,
    inProduction: (data.in_production as boolean) ?? undefined,
    nextAirDate: (data.next_episode_to_air as Record<string, unknown> | null)
      ?.air_date as string | undefined,
    productionCompanies,
    productionCountries,
  };
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

export async function search(
  client: TmdbClient,
  query: string,
  type: MediaType,
  opts?: SearchOpts,
): Promise<{
  results: SearchResult[];
  totalPages: number;
  totalResults: number;
}> {
  const endpoint = type === "movie" ? "/search/movie" : "/search/tv";
  const params: Record<string, string> = { query };
  if (opts?.page) params.page = String(opts.page);
  if (opts?.language) params.language = opts.language;
  if (opts?.region) params.region = opts.region;

  const data = await client.fetch<{
    results: unknown[];
    total_pages: number;
    total_results: number;
  }>(endpoint, params);

  return {
    results: data.results.map((r) => normalizeSearchResult(r, type)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

/* -------------------------------------------------------------------------- */
/*  Full metadata (movie + show)                                              */
/* -------------------------------------------------------------------------- */

export async function getMetadata(
  client: TmdbClient,
  externalId: number,
  type: MediaType,
  opts?: MetadataOpts,
): Promise<NormalizedMedia> {
  const supportedLangs = opts?.supportedLanguages ?? [];
  if (type === "movie") {
    return getMovieMetadata(client, externalId, supportedLangs);
  }
  return getShowMetadata(client, externalId, supportedLangs);
}

async function getMovieMetadata(
  client: TmdbClient,
  movieId: number,
  supportedLangs: string[],
): Promise<NormalizedMedia> {
  const imgLangs = TmdbClient.buildImageLanguageParam(supportedLangs);
  const data = await client.fetch<Record<string, unknown>>(`/movie/${movieId}`, {
    language: "en-US", // Always fetch base in English
    append_to_response: "release_dates,external_ids,images,translations",
    include_image_language: imgLangs,
  });

  const normalized = normalizeMovie(data);
  normalized.translations = parseTranslations(data);
  enrichTranslationsWithImages(normalized.translations, data);
  await enrichTranslationsWithLocalePoster(
    client,
    normalized.translations,
    `/movie/${movieId}`,
    supportedLangs,
  );
  return normalized;
}

async function getShowMetadata(
  client: TmdbClient,
  showId: number,
  supportedLangs: string[],
): Promise<NormalizedMedia> {
  const imgLangs = TmdbClient.buildImageLanguageParam(supportedLangs);
  const data = await client.fetch<Record<string, unknown>>(`/tv/${showId}`, {
    language: "en-US", // Always fetch base in English
    append_to_response: "content_ratings,external_ids,images,translations",
    include_image_language: imgLangs,
  });

  const normalized = normalizeShow(data);
  normalized.translations = parseTranslations(data);
  enrichTranslationsWithImages(normalized.translations, data);
  await enrichTranslationsWithLocalePoster(
    client,
    normalized.translations,
    `/tv/${showId}`,
    supportedLangs,
  );

  // Fetch full season details (including episodes + translations) for each season
  const rawSeasons = (data.seasons ?? []) as Array<{
    season_number: number;
    id: number;
    name: string;
    overview: string;
    air_date: string | null;
    poster_path: string | null;
    episode_count: number;
  }>;

  const seasonTranslations: SeasonTranslation[] = [];
  const episodeTranslations: EpisodeTranslation[] = [];

  const seasonPromises = rawSeasons.map(async (s) => {
    const seasonData = await client.fetch<Record<string, unknown>>(
      `/tv/${showId}/season/${s.season_number}`,
      { language: "en-US", append_to_response: "translations" },
    );

    // Parse season translations
    const sTrans = parseTranslations(seasonData);
    for (const t of sTrans) {
      seasonTranslations.push({
        seasonNumber: s.season_number,
        language: t.language,
        name: t.title,
        overview: t.overview,
      });
    }

    return normalizeSeason(seasonData);
  });

  normalized.seasons = await Promise.all(seasonPromises);

  // Fetch per-language season + episode translations via append_to_response.
  // One call per chunk of ≤19 seasons per language (TMDB caps append_to_response
  // at 20 subrequests; the main endpoint counts toward that budget).
  const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
  if (nonEnLangs.length > 0 && rawSeasons.length > 0) {
    const SEASON_APPEND_CHUNK_SIZE = 19;
    const seasonChunks: number[][] = [];
    for (
      let i = 0;
      i < rawSeasons.length;
      i += SEASON_APPEND_CHUNK_SIZE
    ) {
      seasonChunks.push(
        rawSeasons
          .slice(i, i + SEASON_APPEND_CHUNK_SIZE)
          .map((s) => s.season_number),
      );
    }

    await Promise.allSettled(
      nonEnLangs.map(async (lang) => {
        for (const chunk of seasonChunks) {
          const append = chunk.map((n) => `season/${n}`).join(",");
          try {
            const resp = await client.fetch<Record<string, unknown>>(
              `/tv/${showId}`,
              { language: lang, append_to_response: append },
            );
            for (const seasonNumber of chunk) {
              const sub = resp[`season/${seasonNumber}`] as
                | {
                    name?: string;
                    overview?: string;
                    episodes?: Array<{
                      episode_number: number;
                      name?: string;
                      overview?: string;
                    }>;
                  }
                | undefined;
              if (!sub) continue;
              if (sub.name || sub.overview) {
                seasonTranslations.push({
                  seasonNumber,
                  language: lang,
                  name: sub.name,
                  overview: sub.overview,
                });
              }
              for (const ep of sub.episodes ?? []) {
                if (ep.name || ep.overview) {
                  episodeTranslations.push({
                    seasonNumber,
                    episodeNumber: ep.episode_number,
                    language: lang,
                    title: ep.name,
                    overview: ep.overview,
                  });
                }
              }
            }
          } catch {
            /* skip failed language/chunk */
          }
        }
      }),
    );
  }

  if (seasonTranslations.length > 0)
    normalized.seasonTranslations = seasonTranslations;
  if (episodeTranslations.length > 0)
    normalized.episodeTranslations = episodeTranslations;

  return normalized;
}

/* -------------------------------------------------------------------------- */
/*  Extras (credits, similar, recommendations, videos, watch providers)       */
/* -------------------------------------------------------------------------- */

export async function getExtras(
  client: TmdbClient,
  externalId: number,
  type: MediaType,
  opts?: { supportedLanguages?: string[] },
): Promise<MediaExtras> {
  const prefix = type === "movie" ? "/movie" : "/tv";
  const videoLangs = opts?.supportedLanguages?.length
    ? [
        ...new Set([
          ...opts.supportedLanguages,
          ...opts.supportedLanguages.map((l) => l.split("-")[0]),
        ]),
      ].join(",") + ",en,null"
    : "en,null";
  const data = await client.fetch<Record<string, unknown>>(
    `${prefix}/${externalId}`,
    {
      language: "en-US", // Always English for pool items (base language)
      append_to_response: "credits,similar,recommendations,videos,watch/providers",
      include_video_language: videoLangs,
    },
  );

  const credits = (data.credits ?? {}) as {
    cast?: unknown[];
    crew?: unknown[];
  };

  const cast: CastMember[] = (credits.cast ?? []).map((c: unknown) => {
    const cm = c as Record<string, unknown>;
    return {
      id: cm.id as number,
      name: cm.name as string,
      character: (cm.character as string) ?? "",
      profilePath: (cm.profile_path as string | null) ?? undefined,
      order: (cm.order as number) ?? 0,
    };
  });

  const crew: CrewMember[] = (credits.crew ?? []).map((c: unknown) => {
    const cm = c as Record<string, unknown>;
    return {
      id: cm.id as number,
      name: cm.name as string,
      job: (cm.job as string) ?? "",
      department: (cm.department as string) ?? "",
      profilePath: (cm.profile_path as string | null) ?? undefined,
    };
  });

  const similarRaw = ((data.similar as { results?: unknown[] })?.results ??
    []) as unknown[];
  const recommendationsRaw = ((data.recommendations as { results?: unknown[] })
    ?.results ?? []) as unknown[];
  const videosRaw = ((data.videos as { results?: unknown[] })?.results ??
    []) as unknown[];

  const similar: SearchResult[] = similarRaw.map((r) =>
    normalizeSearchResult(r, type),
  );
  const recommendations: SearchResult[] = recommendationsRaw.map((r) =>
    normalizeSearchResult(r, type),
  );

  const videos: Video[] = videosRaw.map((v: unknown) => {
    const vid = v as Record<string, unknown>;
    return {
      id: vid.id as string,
      key: vid.key as string,
      name: vid.name as string,
      site: vid.site as string,
      type: vid.type as string,
      official: (vid.official as boolean) ?? false,
      language: (vid.iso_639_1 as string) ?? undefined,
    };
  });

  const watchProvidersRaw = data["watch/providers"] as
    | { results?: Record<string, unknown> }
    | undefined;
  const watchProviders = normalizeWatchProviders(
    watchProvidersRaw?.results as
      | Record<
          string,
          { link?: string; flatrate?: unknown[]; rent?: unknown[]; buy?: unknown[] }
        >
      | undefined,
  );

  return {
    credits: { cast, crew },
    similar,
    recommendations,
    videos,
    watchProviders,
  };
}

/* -------------------------------------------------------------------------- */
/*  Standalone translations/images/videos (used for pool items)               */
/* -------------------------------------------------------------------------- */

/** Fetch translations for a single item (used for pool items that aren't persisted as media) */
export async function getTranslations(
  client: TmdbClient,
  id: number,
  type: "movie" | "tv",
  supportedLanguages?: string[],
): Promise<Translation[]> {
  const imgLangs = supportedLanguages?.length
    ? TmdbClient.buildImageLanguageParam(supportedLanguages)
    : "en,null";
  const data = await client.fetch<Record<string, unknown>>(`/${type}/${id}`, {
    language: "en-US",
    append_to_response: "translations,images",
    include_image_language: imgLangs,
  });
  const translations = parseTranslations(data);
  enrichTranslationsWithImages(translations, data);
  return translations;
}

export async function getImages(
  client: TmdbClient,
  id: number,
  type: "movie" | "tv",
): Promise<{
  logos: Array<{ file_path: string; iso_639_1: string | null }>;
}> {
  return client.fetch(`/${type}/${id}/images`, {
    include_image_language: `${client.language},${client.language.split("-")[0]},en,null`,
  });
}

export async function getVideos(
  client: TmdbClient,
  id: number,
  type: "movie" | "tv",
  supportedLanguages?: string[],
): Promise<
  Array<{ key: string; site: string; type: string; language?: string }>
> {
  const videoLangs = supportedLanguages?.length
    ? [
        ...new Set([
          ...supportedLanguages,
          ...supportedLanguages.map((l) => l.split("-")[0]),
        ]),
      ].join(",") + ",en,null"
    : `${client.language},${client.language.split("-")[0]},en,null`;
  const data = await client.fetch<{
    results: Array<{
      key: string;
      site: string;
      type: string;
      iso_639_1?: string;
    }>;
  }>(`/${type}/${id}/videos`, { include_video_language: videoLangs });
  return (data.results ?? []).map((v) => ({ ...v, language: v.iso_639_1 }));
}
