import type {
  CastMember,
  DiscoverOpts,
  MediaExtras,
  MediaType,
  MetadataProvider,
  NormalizedMedia,
  NormalizedSeason,
  SearchOpts,
  SearchResult,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  AniList GraphQL response types (partial — only what we consume)           */
/* -------------------------------------------------------------------------- */

interface AniListTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

interface AniListCoverImage {
  extraLarge: string | null;
  large: string | null;
}

interface AniListDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface AniListStudio {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

interface AniListCharacterEdge {
  node: {
    id: number;
    name: { full: string | null };
    image: { large: string | null };
  };
  role: string;
  voiceActors?: Array<{
    id: number;
    name: { full: string | null };
    image: { large: string | null };
    languageV2: string | null;
  }>;
}

interface AniListRecommendationEdge {
  node: {
    mediaRecommendation: AniListMediaFragment | null;
  };
}

interface AniListRelationEdge {
  relationType: string;
  node: AniListMediaFragment;
}

interface AniListMediaFragment {
  id: number;
  title: AniListTitle;
  coverImage: AniListCoverImage | null;
  bannerImage: string | null;
  startDate: AniListDate | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[] | null;
  format: string | null;
  description: string | null;
}

interface AniListFullMedia extends AniListMediaFragment {
  description: string | null;
  endDate: AniListDate | null;
  status: string | null;
  episodes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  source: string | null;
  countryOfOrigin: string | null;
  isAdult: boolean | null;
  studios: { nodes: AniListStudio[] } | null;
  characters: { edges: AniListCharacterEdge[] } | null;
  recommendations: { edges: AniListRecommendationEdge[] } | null;
  relations: { edges: AniListRelationEdge[] } | null;
}

/* -------------------------------------------------------------------------- */
/*  GraphQL query fragments                                                   */
/* -------------------------------------------------------------------------- */

const MEDIA_FRAGMENT = `
  id
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  startDate { year month day }
  averageScore
  popularity
  genres
  format
  description(asHtml: false)
`;

const FULL_MEDIA_FIELDS = `
  ${MEDIA_FRAGMENT}
  endDate { year month day }
  status
  episodes
  duration
  season
  seasonYear
  source
  countryOfOrigin
  isAdult
  studios(isMain: true) { nodes { id name isAnimationStudio } }
`;

const EXTRAS_FIELDS = `
  id
  characters(sort: ROLE, perPage: 25) {
    edges {
      node {
        id
        name { full }
        image { large }
      }
      role
      voiceActors(language: JAPANESE) {
        id
        name { full }
        image { large }
        languageV2
      }
    }
  }
  recommendations(sort: RATING_DESC, perPage: 20) {
    edges {
      node {
        mediaRecommendation {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  }
  relations {
    edges {
      relationType
      node {
        ${MEDIA_FRAGMENT}
      }
    }
  }
`;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function aniListDateToString(date: AniListDate | null | undefined): string | undefined {
  if (!date?.year) return undefined;
  const y = String(date.year);
  const m = date.month ? String(date.month).padStart(2, "0") : "01";
  const d = date.day ? String(date.day).padStart(2, "0") : "01";
  return `${y}-${m}-${d}`;
}

function yearFromAniListDate(date: AniListDate | null | undefined): number | undefined {
  return date?.year ?? undefined;
}

function stripHtml(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function resolveTitle(title: AniListTitle | null | undefined): string {
  if (!title) return "";
  return title.english ?? title.romaji ?? title.native ?? "";
}

function mapStatus(status: string | null | undefined): string | undefined {
  if (!status) return undefined;
  switch (status) {
    case "RELEASING":
      return "Returning Series";
    case "FINISHED":
      return "Ended";
    case "NOT_YET_RELEASED":
      return "Planned";
    case "CANCELLED":
      return "Canceled";
    case "HIATUS":
      return "Returning Series";
    default:
      return status;
  }
}

/* -------------------------------------------------------------------------- */
/*  AniListProvider                                                           */
/* -------------------------------------------------------------------------- */

export class AniListProvider implements MetadataProvider {
  name = "anilist" as const;
  private endpoint = "https://graphql.anilist.co";

  /* ── Generic GraphQL fetcher ─────────────────────────────────────────── */

  private async query<T>(
    gql: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: gql, variables }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `AniList API error: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors && json.errors.length > 0) {
      throw new Error(
        `AniList GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`,
      );
    }

    if (!json.data) {
      throw new Error("AniList API returned no data");
    }

    return json.data;
  }

  /* ── Search ─────────────────────────────────────────────────────────── */

  async search(
    queryStr: string,
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    if (type === "movie") {
      return { results: [], totalPages: 0, totalResults: 0 };
    }

    const gql = `
      query ($search: String!, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            lastPage
            currentPage
            perPage
          }
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;

    const data = await this.query<{
      Page: {
        pageInfo: { total: number; lastPage: number };
        media: AniListMediaFragment[];
      };
    }>(gql, {
      search: queryStr,
      page: opts?.page ?? 1,
      perPage: 20,
    });

    return {
      results: data.Page.media.map((m) => this.normalizeSearchResult(m)),
      totalPages: data.Page.pageInfo.lastPage,
      totalResults: data.Page.pageInfo.total,
    };
  }

  /* ── Full metadata ──────────────────────────────────────────────────── */

  async getMetadata(externalId: number, type: MediaType): Promise<NormalizedMedia> {
    if (type === "movie") {
      throw new Error("AniList provider does not support movies");
    }

    const gql = `
      query ($id: Int!) {
        Media(id: $id, type: ANIME) {
          ${FULL_MEDIA_FIELDS}
        }
      }
    `;

    const data = await this.query<{ Media: AniListFullMedia }>(gql, { id: externalId });

    return this.normalizeFullMedia(data.Media);
  }

  /* ── Extras ─────────────────────────────────────────────────────────── */

  async getExtras(externalId: number, type: MediaType): Promise<MediaExtras> {
    if (type === "movie") {
      return {
        credits: { cast: [], crew: [] },
        similar: [],
        recommendations: [],
        videos: [],
      };
    }

    const gql = `
      query ($id: Int!) {
        Media(id: $id, type: ANIME) {
          ${EXTRAS_FIELDS}
        }
      }
    `;

    const data = await this.query<{ Media: AniListFullMedia }>(gql, { id: externalId });
    const media = data.Media;

    // Map characters to cast members (using voice actors for the "actor" info)
    const cast: CastMember[] = (media.characters?.edges ?? []).map(
      (edge, index) => {
        const japaneseVa = edge.voiceActors?.[0];
        return {
          id: edge.node.id,
          name: japaneseVa?.name?.full ?? edge.node.name?.full ?? "",
          character: edge.node.name?.full ?? "",
          profilePath: japaneseVa?.image?.large ?? edge.node.image?.large ?? undefined,
          order: index,
        };
      },
    );

    // Recommendations
    const recommendations: SearchResult[] = (media.recommendations?.edges ?? [])
      .filter(
        (edge): edge is AniListRecommendationEdge & { node: { mediaRecommendation: AniListMediaFragment } } =>
          edge.node.mediaRecommendation !== null,
      )
      .map((edge) => this.normalizeSearchResult(edge.node.mediaRecommendation));

    // Relations as "similar" (sequels, prequels, side stories, etc.)
    const similar: SearchResult[] = (media.relations?.edges ?? [])
      .filter((edge) => {
        const relType = edge.relationType;
        return (
          relType === "SEQUEL" ||
          relType === "PREQUEL" ||
          relType === "SIDE_STORY" ||
          relType === "ALTERNATIVE" ||
          relType === "SPIN_OFF" ||
          relType === "PARENT"
        );
      })
      .map((edge) => this.normalizeSearchResult(edge.node));

    return {
      credits: { cast, crew: [] },
      similar,
      recommendations,
      videos: [], // AniList does not provide video/trailer data in the API
    };
  }

  /* ── Trending ───────────────────────────────────────────────────────── */

  async getTrending(
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    const formatFilter = type === "movie" ? "format: MOVIE," : "format_not: MOVIE,";

    const gql = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            lastPage
          }
          media(type: ANIME, ${formatFilter} sort: TRENDING_DESC) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;

    const data = await this.query<{
      Page: {
        pageInfo: { lastPage: number };
        media: AniListMediaFragment[];
      };
    }>(gql, {
      page: opts?.page ?? 1,
      perPage: 20,
    });

    const results = data.Page.media.map((m) => this.normalizeSearchResult(m, type));
    return {
      results,
      totalPages: data.Page.pageInfo.lastPage,
      totalResults: data.Page.pageInfo.lastPage * 20,
    };
  }

  /* ── Discover (stub — AniList has no discover endpoint) ────────────── */

  async discover(
    _type: MediaType,
    _opts?: DiscoverOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }> {
    return { results: [], totalPages: 0, totalResults: 0 };
  }

  /* ── Private normalization ──────────────────────────────────────────── */

  private normalizeSearchResult(media: AniListMediaFragment, typeOverride?: MediaType): SearchResult {
    const releaseDate = aniListDateToString(media.startDate);
    const type: MediaType = typeOverride ?? (media.format === "MOVIE" ? "movie" : "show");

    return {
      externalId: media.id,
      provider: "anilist",
      type,
      title: resolveTitle(media.title),
      originalTitle: media.title?.native ?? undefined,
      overview: stripHtml(media.description),
      posterPath: media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined,
      backdropPath: media.bannerImage ?? undefined,
      releaseDate,
      year: yearFromAniListDate(media.startDate),
      voteAverage:
        media.averageScore !== null && media.averageScore !== undefined
          ? media.averageScore / 10
          : undefined,
      popularity: media.popularity ?? undefined,
    };
  }

  private normalizeFullMedia(media: AniListFullMedia): NormalizedMedia {
    const releaseDate = aniListDateToString(media.startDate);
    const lastAirDate = aniListDateToString(media.endDate);

    // Studios as networks and production companies
    const studioNodes = media.studios?.nodes ?? [];
    const networks = studioNodes.map((s) => s.name);
    const productionCompanies = studioNodes.map((s) => ({
      id: s.id,
      name: s.name,
      logoPath: undefined,
    }));

    // Build a single season containing all episodes
    const seasons: NormalizedSeason[] = [];
    if (media.episodes !== null && media.episodes !== undefined && media.episodes > 0) {
      seasons.push({
        number: 1,
        name: "Season 1",
        episodeCount: media.episodes,
        airDate: releaseDate,
      });
    }

    // Content rating
    const contentRating = media.isAdult ? "18+" : undefined;

    // Origin country
    const originCountry = media.countryOfOrigin ? [media.countryOfOrigin] : undefined;

    return {
      externalId: media.id,
      provider: "anilist",
      type: "show",
      title: resolveTitle(media.title),
      originalTitle: media.title?.native ?? undefined,
      overview: stripHtml(media.description),
      releaseDate,
      year: yearFromAniListDate(media.startDate),
      lastAirDate,
      status: mapStatus(media.status),
      genres: media.genres ?? [],
      contentRating,
      originalLanguage: media.countryOfOrigin === "JP" ? "ja" : undefined,
      originCountry,
      voteAverage:
        media.averageScore !== null && media.averageScore !== undefined
          ? media.averageScore / 10
          : undefined,
      popularity: media.popularity ?? undefined,
      runtime: media.duration ?? undefined,
      posterPath: media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined,
      backdropPath: media.bannerImage ?? undefined,
      seasons,
      networks,
      numberOfSeasons: seasons.length > 0 ? 1 : undefined,
      numberOfEpisodes: media.episodes ?? undefined,
      inProduction: media.status === "RELEASING" ? true : undefined,
      productionCompanies,
    };
  }
}
