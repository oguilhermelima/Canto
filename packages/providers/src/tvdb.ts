import type {
  DiscoverOpts,
  MediaExtras,
  MediaType,
  MetadataProvider,
  NormalizedEpisode,
  NormalizedMedia,
  NormalizedSeason,
  SearchOpts,
  SearchResult,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  TVDB raw response types (partial — only what we consume)                  */
/* -------------------------------------------------------------------------- */

interface TvdbArtwork {
  id: number;
  image: string;
  type: number; // 2=poster, 3=backdrop (banner)
  language: string | null;
}

interface TvdbRemoteId {
  id: string;
  type: number;
  sourceName: string;
}

interface TvdbEpisode {
  id: number;
  name: string | null;
  overview: string | null;
  aired: string | null;
  runtime: number | null;
  image: string | null;
  number: number;
  seasonNumber: number;
  absoluteNumber: number | null;
  finaleType: string | null;
}

interface TvdbSeason {
  id: number;
  number: number;
  name: string | null;
  image: string | null;
  type: { id: number; name: string; type: string } | null;
}

interface TvdbSeriesExtended {
  id: number;
  name: string;
  slug: string;
  overview: string | null;
  image: string | null;
  firstAired: string | null;
  lastAired: string | null;
  status: { name: string } | null;
  originalLanguage: string | null;
  genres: Array<{ id: number; name: string }> | null;
  artworks: TvdbArtwork[] | null;
  remoteIds: TvdbRemoteId[] | null;
  seasons: TvdbSeason[] | null;
  originalNetwork: { name: string } | null;
  latestNetwork: { name: string } | null;
  averageRuntime: number | null;
  episodes: TvdbEpisode[] | null;
  year: string | null;
  nextAired: string | null;
}

interface TvdbSearchResult {
  objectID: string;
  name: string;
  overview: string | null;
  image_url: string | null;
  first_air_time: string | null;
  year: string | null;
  tvdb_id: string;
  type: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const TVDB_IMAGE_HOST = "https://artworks.thetvdb.com";

function prefixImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  // TVDB paths may start with / or /banners/ — normalize
  if (url.startsWith("/")) return `${TVDB_IMAGE_HOST}${url}`;
  return `${TVDB_IMAGE_HOST}/banners/${url}`;
}

function mapStatus(status: string | null | undefined): string | undefined {
  if (!status) return undefined;
  switch (status) {
    case "Continuing":
      return "Returning Series";
    case "Ended":
      return "Ended";
    case "Upcoming":
      return "Planned";
    default:
      return status;
  }
}

function extractImdbId(remoteIds: TvdbRemoteId[] | null | undefined): string | undefined {
  if (!remoteIds) return undefined;
  const imdb = remoteIds.find(
    (r) => r.sourceName === "IMDB" || r.sourceName === "imdb",
  );
  return imdb?.id ?? undefined;
}

function findArtwork(
  artworks: TvdbArtwork[] | null | undefined,
  type: number,
  preferLang?: string,
): string | undefined {
  if (!artworks || artworks.length === 0) return undefined;
  const ofType = artworks.filter((a) => a.type === type);
  if (ofType.length === 0) return undefined;
  if (preferLang) {
    const langMatch = ofType.find((a) => a.language === preferLang);
    if (langMatch) return langMatch.image;
  }
  return ofType[0]!.image;
}

/* -------------------------------------------------------------------------- */
/*  TvdbProvider                                                               */
/* -------------------------------------------------------------------------- */

export class TvdbProvider implements MetadataProvider {
  name = "tvdb" as const;
  private baseUrl = "https://api4.thetvdb.com/v4";
  private apiKey: string;
  private token: string | null;
  private tokenExpires: number | null;
  private onTokenRefresh?: (token: string, expires: number) => void | Promise<void>;

  constructor(opts: {
    apiKey: string;
    token?: string | null;
    tokenExpires?: number | null;
    onTokenRefresh?: (token: string, expires: number) => void | Promise<void>;
  }) {
    this.apiKey = opts.apiKey;
    this.token = opts.token ?? null;
    this.tokenExpires = opts.tokenExpires ?? null;
    this.onTokenRefresh = opts.onTokenRefresh;
  }

  /* ── JWT Auth ──────────────────────────────────────────────────────── */

  private async authenticate(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: this.apiKey }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`TVDB login failed: ${res.status} ${res.statusText} — ${body}`);
    }

    const json = (await res.json()) as { data: { token: string } };
    const token = json.data.token;
    // Token valid for 28 days
    const expires = Date.now() + 28 * 24 * 60 * 60 * 1000;

    this.token = token;
    this.tokenExpires = expires;

    if (this.onTokenRefresh) {
      await this.onTokenRefresh(token, expires);
    }

    return token;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.tokenExpires && Date.now() < this.tokenExpires) {
      return this.token;
    }
    return this.authenticate();
  }

  private async request<T>(path: string, retry = true): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 && retry) {
      // Token expired or invalid — re-authenticate and retry once
      await this.authenticate();
      return this.request<T>(path, false);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`TVDB API error: ${res.status} ${res.statusText} — ${path} — ${body}`);
    }

    const json = (await res.json()) as { data: T };
    return json.data;
  }

  /* ── Search ────────────────────────────────────────────────────────── */

  async search(
    query: string,
    type: MediaType,
    _opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    // TVDB search only supports series for our use case
    if (type === "movie") {
      return { results: [], totalPages: 0, totalResults: 0 };
    }

    const encoded = encodeURIComponent(query);
    const data = await this.request<TvdbSearchResult[]>(
      `/search?query=${encoded}&type=series`,
    );

    const results: SearchResult[] = (data ?? []).map((item) => ({
      externalId: parseInt(item.tvdb_id, 10),
      provider: "tvdb" as const,
      type: "show" as const,
      title: item.name,
      overview: item.overview ?? undefined,
      posterPath: item.image_url ?? undefined,
      releaseDate: item.first_air_time ?? undefined,
      year: item.year ? parseInt(item.year, 10) : undefined,
    }));

    return {
      results,
      totalPages: 1,
      totalResults: results.length,
    };
  }

  /* ── Full metadata ─────────────────────────────────────────────────── */

  async getMetadata(externalId: number, type: MediaType): Promise<NormalizedMedia> {
    if (type === "movie") {
      throw new Error("TVDB provider does not support movies");
    }

    const series = await this.request<TvdbSeriesExtended>(
      `/series/${externalId}/extended`,
    );

    // Fetch English translation for series (title + overview)
    let engTitle: string | undefined;
    let engOverview: string | undefined;
    try {
      const translation = await this.request<{ name?: string; overview?: string }>(
        `/series/${externalId}/translations/eng`,
      );
      engTitle = translation?.name || undefined;
      engOverview = translation?.overview || undefined;
    } catch {
      // English translation not available, use original
    }

    // Fetch all episodes (paginated, in English)
    const allEpisodes = await this.fetchAllEpisodes(externalId);

    // Group episodes by season
    const episodesBySeason = new Map<number, TvdbEpisode[]>();
    for (const ep of allEpisodes) {
      const seasonNum = ep.seasonNumber;
      if (!episodesBySeason.has(seasonNum)) {
        episodesBySeason.set(seasonNum, []);
      }
      episodesBySeason.get(seasonNum)!.push(ep);
    }

    // Build NormalizedSeason[] — only include default/official seasons
    const allowedSeasonTypes = new Set(["default", "official"]);
    const seasons: NormalizedSeason[] = (series.seasons ?? [])
      .filter((s) => !s.type?.type || allowedSeasonTypes.has(s.type.type))
      .map((s): NormalizedSeason | null => {
        const seasonEpisodes = episodesBySeason.get(s.number) ?? [];
        const episodes: NormalizedEpisode[] = seasonEpisodes
          .sort((a, b) => a.number - b.number)
          .map((ep) => ({
            number: ep.number,
            externalId: ep.id,
            title: ep.name ?? undefined,
            overview: ep.overview ?? undefined,
            airDate: ep.aired ?? undefined,
            runtime: ep.runtime ?? undefined,
            stillPath: ep.image ? prefixImageUrl(ep.image) : undefined,
            absoluteNumber: ep.absoluteNumber ?? undefined,
            finaleType: ep.finaleType ?? undefined,
          }));

        return {
          number: s.number,
          externalId: s.id,
          name: s.name ?? undefined,
          posterPath: s.image ? prefixImageUrl(s.image) : undefined,
          episodeCount: episodes.length,
          seasonType: s.type?.type ?? undefined,
          episodes,
        };
      })
      .filter((s): s is NormalizedSeason => s !== null);

    // Fetch English season names (best-effort, parallel)
    await Promise.allSettled(
      seasons.map(async (s) => {
        if (!s.externalId) return;
        try {
          const translation = await this.request<{ name?: string }>(
            `/seasons/${s.externalId}/translations/eng`,
          );
          if (translation?.name) s.name = translation.name;
        } catch {
          // Keep original name
        }
      }),
    );

    // Extract artwork
    const rawPoster = findArtwork(series.artworks, 2, "eng") ?? series.image ?? undefined;
    const rawBackdrop = findArtwork(series.artworks, 3, "eng");
    const posterPath = rawPoster ? prefixImageUrl(rawPoster) : undefined;
    const backdropPath = rawBackdrop ? prefixImageUrl(rawBackdrop) : undefined;

    // Networks
    const networks: string[] = [];
    if (series.originalNetwork?.name) networks.push(series.originalNetwork.name);
    if (series.latestNetwork?.name && series.latestNetwork.name !== series.originalNetwork?.name) {
      networks.push(series.latestNetwork.name);
    }

    // Count total episodes (exclude specials / season 0)
    const regularSeasons = seasons.filter((s) => s.number > 0);
    const totalEpisodes = regularSeasons.reduce(
      (sum, s) => sum + (s.episodeCount ?? 0),
      0,
    );

    const statusName = series.status?.name ?? undefined;

    return {
      externalId: series.id,
      provider: "tvdb",
      type: "show",
      title: engTitle ?? series.name,
      originalTitle: series.name !== (engTitle ?? series.name) ? series.name : undefined,
      overview: engOverview ?? series.overview ?? undefined,
      releaseDate: series.firstAired ?? undefined,
      year: series.year ? parseInt(series.year, 10) : undefined,
      lastAirDate: series.lastAired ?? undefined,
      status: mapStatus(statusName),
      genres: (series.genres ?? []).map((g) => g.name),
      originalLanguage: series.originalLanguage ?? undefined,
      runtime: series.averageRuntime ?? undefined,
      posterPath,
      backdropPath,
      imdbId: extractImdbId(series.remoteIds),
      tvdbId: series.id,
      nextAirDate: series.nextAired || undefined,
      seasons,
      networks: networks.length > 0 ? networks : undefined,
      numberOfSeasons: regularSeasons.length > 0 ? regularSeasons.length : undefined,
      numberOfEpisodes: totalEpisodes > 0 ? totalEpisodes : undefined,
      inProduction: statusName === "Continuing" ? true : undefined,
    };
  }

  /* ── Paginated episode fetching ────────────────────────────────────── */

  private async fetchAllEpisodes(seriesId: number): Promise<TvdbEpisode[]> {
    const allEpisodes: TvdbEpisode[] = [];
    let page = 0;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const data = await this.request<{ episodes: TvdbEpisode[] }>(
        `/series/${seriesId}/episodes/default/eng?page=${page}`,
      );

      const episodes = data?.episodes ?? [];
      if (episodes.length === 0) break;

      allEpisodes.push(...episodes);
      // TVDB returns 500 episodes per page
      if (episodes.length < 500) break;
      page++;
    }

    return allEpisodes;
  }

  /* ── Extras (stub — TVDB has no extras API) ────────────────────────── */

  async getExtras(
    _externalId: number,
    _type: MediaType,
  ): Promise<MediaExtras> {
    return {
      credits: { cast: [], crew: [] },
      similar: [],
      recommendations: [],
      videos: [],
    };
  }

  /* ── Trending (stub — TVDB has no trending endpoint) ───────────────── */

  async getTrending(
    _type: MediaType,
    _opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    return { results: [], totalPages: 0, totalResults: 0 };
  }

  /* ── Discover (stub — TVDB has no discover endpoint) ───────────────── */

  async discover(
    _type: MediaType,
    _opts?: DiscoverOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    return { results: [], totalPages: 0, totalResults: 0 };
  }
}
