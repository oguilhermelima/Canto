import type {
  CastMember,
  CrewMember,
  DiscoverOpts,
  MediaExtras,
  MediaType,
  MetadataProvider,
  NormalizedEpisode,
  NormalizedMedia,
  NormalizedSeason,
  PersonCredit,
  PersonDetail,
  SearchOpts,
  SearchResult,
  Video,
  WatchProvider,
  WatchProvidersByRegion,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  TMDB raw response types (partial — only what we consume)                  */
/* -------------------------------------------------------------------------- */

interface TmdbGenre {
  id: number;
  name: string;
}

interface TmdbNetwork {
  id: number;
  name: string;
  logo_path: string | null;
}

interface TmdbProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

interface TmdbCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

interface TmdbImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
}

interface TmdbReleaseDateEntry {
  certification: string;
  iso_639_1: string;
  release_date: string;
  type: number;
}

interface TmdbReleaseDate {
  iso_3166_1: string;
  release_dates: TmdbReleaseDateEntry[];
}

interface TmdbContentRating {
  iso_3166_1: string;
  rating: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function yearFromDate(dateStr: string | null | undefined): number | undefined {
  if (!dateStr) return undefined;
  const y = parseInt(dateStr.substring(0, 4), 10);
  return Number.isNaN(y) ? undefined : y;
}

function normalizeWatchProviders(
  raw: Record<string, { flatrate?: unknown[]; rent?: unknown[]; buy?: unknown[] }> | undefined,
): WatchProvidersByRegion | undefined {
  if (!raw) return undefined;

  const result: WatchProvidersByRegion = {};

  for (const [region, data] of Object.entries(raw)) {
    const mapProviders = (list?: unknown[]): WatchProvider[] | undefined => {
      if (!list || list.length === 0) return undefined;
      return (list as Array<{ provider_id: number; provider_name: string; logo_path: string }>).map(
        (p) => ({
          providerId: p.provider_id,
          providerName: p.provider_name,
          logoPath: p.logo_path,
        }),
      );
    };

    const entry: WatchProvidersByRegion[string] = {};
    const flatrate = mapProviders(data.flatrate);
    const rent = mapProviders(data.rent);
    const buy = mapProviders(data.buy);
    if (flatrate) entry.flatrate = flatrate;
    if (rent) entry.rent = rent;
    if (buy) entry.buy = buy;

    if (Object.keys(entry).length > 0) {
      result[region] = entry;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/* -------------------------------------------------------------------------- */
/*  TmdbProvider                                                              */
/* -------------------------------------------------------------------------- */

export class TmdbProvider implements MetadataProvider {
  name = "tmdb" as const;
  private apiKey: string;
  private baseUrl = "https://api.themoviedb.org/3";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /* ── Generic fetcher ────────────────────────────────────────────────── */

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    // v3 API key as query parameter
    url.searchParams.set("api_key", this.apiKey);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText} — ${path} — ${body}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /* ── Search ─────────────────────────────────────────────────────────── */

  async search(
    query: string,
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    const endpoint = type === "movie" ? "/search/movie" : "/search/tv";
    const params: Record<string, string> = { query };
    if (opts?.page) params.page = String(opts.page);
    if (opts?.language) params.language = opts.language;
    if (opts?.region) params.region = opts.region;

    const data = await this.fetch<{
      results: unknown[];
      total_pages: number;
      total_results: number;
    }>(endpoint, params);

    return {
      results: data.results.map((r) => this.normalizeSearchResult(r, type)),
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  /* ── Full metadata ──────────────────────────────────────────────────── */

  async getMetadata(externalId: number, type: MediaType): Promise<NormalizedMedia> {
    if (type === "movie") {
      return this.getMovieMetadata(externalId);
    }
    return this.getShowMetadata(externalId);
  }

  private async getMovieMetadata(movieId: number): Promise<NormalizedMedia> {
    const data = await this.fetch<Record<string, unknown>>(
      `/movie/${movieId}`,
      {
        append_to_response: "release_dates,external_ids,images",
        include_image_language: "en,null",
      },
    );

    return this.normalizeMovie(data);
  }

  private async getShowMetadata(showId: number): Promise<NormalizedMedia> {
    const data = await this.fetch<Record<string, unknown>>(
      `/tv/${showId}`,
      {
        append_to_response: "content_ratings,external_ids,images",
        include_image_language: "en,null",
      },
    );

    const normalized = this.normalizeShow(data);

    // Fetch full season details (including episodes) for each season
    const rawSeasons = (data.seasons ?? []) as Array<{
      season_number: number;
      id: number;
      name: string;
      overview: string;
      air_date: string | null;
      poster_path: string | null;
      episode_count: number;
    }>;

    const seasonPromises = rawSeasons.map(async (s) => {
      const seasonData = await this.fetch<Record<string, unknown>>(
        `/tv/${showId}/season/${s.season_number}`,
      );
      return this.normalizeSeason(seasonData);
    });

    normalized.seasons = await Promise.all(seasonPromises);

    return normalized;
  }

  /* ── Extras ─────────────────────────────────────────────────────────── */

  async getExtras(externalId: number, type: MediaType): Promise<MediaExtras> {
    const prefix = type === "movie" ? "/movie" : "/tv";
    const data = await this.fetch<Record<string, unknown>>(
      `${prefix}/${externalId}`,
      {
        append_to_response: "credits,similar,recommendations,videos,watch/providers",
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

    const similarRaw = (
      (data.similar as { results?: unknown[] })?.results ?? []
    ) as unknown[];
    const recommendationsRaw = (
      (data.recommendations as { results?: unknown[] })?.results ?? []
    ) as unknown[];
    const videosRaw = (
      (data.videos as { results?: unknown[] })?.results ?? []
    ) as unknown[];

    const similar: SearchResult[] = similarRaw.map((r) =>
      this.normalizeSearchResult(r, type),
    );
    const recommendations: SearchResult[] = recommendationsRaw.map((r) =>
      this.normalizeSearchResult(r, type),
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
      };
    });

    const watchProvidersRaw = data["watch/providers"] as
      | { results?: Record<string, unknown> }
      | undefined;
    const watchProviders = normalizeWatchProviders(
      watchProvidersRaw?.results as
        | Record<string, { flatrate?: unknown[]; rent?: unknown[]; buy?: unknown[] }>
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

  /* ── Trending ───────────────────────────────────────────────────────── */

  async getTrending(
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    const endpoint =
      type === "movie" ? "/trending/movie/week" : "/trending/tv/week";
    const params: Record<string, string> = {};
    if (opts?.page) params.page = String(opts.page);
    if (opts?.language) params.language = opts.language;

    const data = await this.fetch<{
      results: unknown[];
      total_pages: number;
      total_results: number;
    }>(endpoint, params);

    return {
      results: data.results.map((r) => this.normalizeSearchResult(r, type)),
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  /* ── Trending with server-side filters ────────────────────────────── */

  async getTrendingFiltered(
    type: MediaType,
    opts?: {
      page?: number;
      genreIds?: number[];
      language?: string;
    },
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    const endpoint =
      type === "movie" ? "/trending/movie/week" : "/trending/tv/week";
    const targetCount = 20;
    const maxPages = 5;
    const startPage = opts?.page ?? 1;
    const allResults: SearchResult[] = [];

    for (let p = startPage; p < startPage + maxPages; p++) {
      const params: Record<string, string> = { page: String(p) };

      const data = await this.fetch<{
        results: Array<Record<string, unknown>>;
        total_pages: number;
      }>(endpoint, params);

      if (data.results.length === 0) break;

      for (const raw of data.results) {
        const rawGenres = (raw.genre_ids ?? []) as number[];
        const origLang = raw.original_language as string;

        // Apply genre filter
        if (opts?.genreIds && opts.genreIds.length > 0) {
          if (!opts.genreIds.some((g) => rawGenres.includes(g))) continue;
        }
        // Apply language filter
        if (opts?.language && origLang !== opts.language) continue;

        allResults.push(this.normalizeSearchResult(raw, type));
      }

      if (allResults.length >= targetCount || p >= data.total_pages) break;
    }

    return {
      results: allResults.slice(0, targetCount),
      totalPages: Math.max(1, Math.ceil(allResults.length / targetCount)),
      totalResults: allResults.length,
    };
  }

  /* ── Discover ─────────────────────────────────────────────────────── */

  async discover(
    type: MediaType,
    opts?: DiscoverOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    const endpoint = type === "movie" ? "/discover/movie" : "/discover/tv";
    const params: Record<string, string> = {};
    if (opts?.page) params.page = String(opts.page);
    if (opts?.with_genres) params.with_genres = opts.with_genres;
    if (opts?.with_original_language) params.with_original_language = opts.with_original_language;
    params.sort_by = opts?.sort_by ?? "popularity.desc";
    if (type === "show" && opts?.first_air_date_gte) {
      params["first_air_date.gte"] = opts.first_air_date_gte;
    }
    if (type === "movie" && opts?.release_date_gte) {
      params["release_date.gte"] = opts.release_date_gte;
    }

    const data = await this.fetch<{
      results: unknown[];
      total_pages: number;
      total_results: number;
    }>(endpoint, params);

    return {
      results: data.results.map((r) => this.normalizeSearchResult(r, type)),
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  /* ── Person detail ────────────────────────────────────────────────── */

  async getPerson(personId: number): Promise<PersonDetail> {
    const data = await this.fetch<Record<string, unknown>>(
      `/person/${personId}`,
      { append_to_response: "combined_credits,images" },
    );

    const combinedCredits = (data.combined_credits ?? {}) as {
      cast?: unknown[];
    };

    const rawCast = (combinedCredits.cast ?? []) as Array<Record<string, unknown>>;

    const movieCredits: PersonCredit[] = [];
    const tvCredits: PersonCredit[] = [];

    for (const c of rawCast) {
      const mediaType = c.media_type as string;
      const isMovie = mediaType === "movie";
      const title = isMovie
        ? ((c.title as string) ?? "")
        : ((c.name as string) ?? "");
      const releaseDate = isMovie
        ? ((c.release_date as string) ?? undefined)
        : ((c.first_air_date as string) ?? undefined);

      const credit: PersonCredit = {
        id: c.id as number,
        title,
        character: (c.character as string) ?? undefined,
        posterPath: (c.poster_path as string | null) ?? undefined,
        backdropPath: (c.backdrop_path as string | null) ?? undefined,
        releaseDate,
        year: yearFromDate(releaseDate),
        voteAverage: (c.vote_average as number) ?? undefined,
        mediaType: isMovie ? "movie" : "show",
      };

      if (isMovie) {
        movieCredits.push(credit);
      } else if (mediaType === "tv") {
        tvCredits.push(credit);
      }
    }

    // Sort by popularity (vote_average * vote_count approximation via popularity) descending
    const sortByPopularity = (a: PersonCredit, b: PersonCredit): number =>
      (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
    movieCredits.sort(sortByPopularity);
    tvCredits.sort(sortByPopularity);

    const rawImages = (data.images as { profiles?: unknown[] } | undefined);
    const images = ((rawImages?.profiles ?? []) as Array<Record<string, unknown>>).map(
      (img) => ({
        filePath: img.file_path as string,
        aspectRatio: (img.aspect_ratio as number) ?? 0.667,
      }),
    );

    return {
      id: data.id as number,
      name: (data.name as string) ?? "",
      biography: (data.biography as string) ?? "",
      birthday: (data.birthday as string | null) ?? null,
      deathday: (data.deathday as string | null) ?? null,
      placeOfBirth: (data.place_of_birth as string | null) ?? null,
      profilePath: (data.profile_path as string | null) ?? null,
      knownForDepartment: (data.known_for_department as string | null) ?? null,
      alsoKnownAs: (data.also_known_as as string[]) ?? [],
      gender: (data.gender as number) ?? 0,
      popularity: (data.popularity as number) ?? 0,
      images,
      movieCredits,
      tvCredits,
    };
  }

  /* ── Private normalization ──────────────────────────────────────────── */

  private normalizeMovie(data: Record<string, unknown>): NormalizedMedia {
    const genres = ((data.genres ?? []) as TmdbGenre[]).map((g) => g.name);

    // Extract content rating from release_dates (US certification)
    let contentRating: string | undefined;
    const releaseDates = data.release_dates as { results?: TmdbReleaseDate[] } | undefined;
    if (releaseDates?.results) {
      const usRelease = releaseDates.results.find(
        (rd) => rd.iso_3166_1 === "US",
      );
      if (usRelease) {
        // Prefer theatrical (type 3) or regular (type 3,4,5) certification
        const cert = usRelease.release_dates.find(
          (rd) => rd.certification && rd.certification.length > 0,
        );
        if (cert) contentRating = cert.certification;
      }
    }

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
    const externalIds = data.external_ids as { imdb_id?: string } | undefined;

    // Production companies
    const rawCompanies = (data.production_companies ?? []) as TmdbProductionCompany[];
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
    const rawCollection = data.belongs_to_collection as TmdbCollection | null | undefined;
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
      contentRating,
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
      budget: (data.budget as number) ?? undefined,
      revenue: (data.revenue as number) ?? undefined,
      collection,
      productionCompanies,
      productionCountries,
    };
  }

  private normalizeShow(data: Record<string, unknown>): NormalizedMedia {
    const genres = ((data.genres ?? []) as TmdbGenre[]).map((g) => g.name);

    // Extract content rating (TV)
    let contentRating: string | undefined;
    const contentRatings = data.content_ratings as
      | { results?: TmdbContentRating[] }
      | undefined;
    if (contentRatings?.results) {
      const usRating = contentRatings.results.find(
        (cr) => cr.iso_3166_1 === "US",
      );
      if (usRating) contentRating = usRating.rating;
    }

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
    const externalIds = data.external_ids as { imdb_id?: string } | undefined;

    // Networks
    const rawNetworks = (data.networks ?? []) as TmdbNetwork[];
    const networks = rawNetworks.map((n) => n.name);

    // Production companies
    const rawCompanies = (data.production_companies ?? []) as TmdbProductionCompany[];
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
      contentRating,
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
      seasons,
      networks,
      numberOfSeasons: (data.number_of_seasons as number) ?? undefined,
      numberOfEpisodes: (data.number_of_episodes as number) ?? undefined,
      inProduction: (data.in_production as boolean) ?? undefined,
      productionCompanies,
      productionCountries,
    };
  }

  private normalizeSeason(data: Record<string, unknown>): NormalizedSeason {
    const rawEpisodes = (data.episodes ?? []) as Array<Record<string, unknown>>;

    const episodes: NormalizedEpisode[] = rawEpisodes.map((ep) => ({
      number: ep.episode_number as number,
      externalId: ep.id as number,
      title: (ep.name as string) ?? undefined,
      overview: (ep.overview as string) ?? undefined,
      airDate: (ep.air_date as string | null) ?? undefined,
      runtime: (ep.runtime as number | null) ?? undefined,
      stillPath: (ep.still_path as string | null) ?? undefined,
      voteAverage: (ep.vote_average as number) ?? undefined,
    }));

    return {
      number: data.season_number as number,
      externalId: data.id as number,
      name: (data.name as string) ?? undefined,
      overview: (data.overview as string) ?? undefined,
      airDate: (data.air_date as string | null) ?? undefined,
      posterPath: (data.poster_path as string | null) ?? undefined,
      episodeCount: episodes.length,
      episodes,
    };
  }

  private normalizeSearchResult(raw: unknown, type: MediaType): SearchResult {
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

  async getImages(
    id: number,
    type: "movie" | "tv",
  ): Promise<{ logos: Array<{ file_path: string; iso_639_1: string | null }> }> {
    return this.fetch(`/${type}/${id}/images`, { include_image_language: "en,null" });
  }

  async getVideos(
    id: number,
    type: "movie" | "tv",
  ): Promise<Array<{ key: string; site: string; type: string }>> {
    const data = await this.fetch<{
      results: Array<{ key: string; site: string; type: string }>;
    }>(`/${type}/${id}/videos`);
    return data.results ?? [];
  }
}
