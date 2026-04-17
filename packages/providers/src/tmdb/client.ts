import type { WatchProvider, WatchProvidersByRegion } from "../types";

/* -------------------------------------------------------------------------- */
/*  TMDB raw response types (partial — only what we consume)                  */
/* -------------------------------------------------------------------------- */

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbNetwork {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface TmdbProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface TmdbCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
}

export interface TmdbReleaseDateEntry {
  certification: string;
  iso_639_1: string;
  release_date: string;
  type: number;
}

export interface TmdbReleaseDate {
  iso_3166_1: string;
  release_dates: TmdbReleaseDateEntry[];
}

export interface TmdbContentRating {
  iso_3166_1: string;
  rating: string;
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

export function yearFromDate(
  dateStr: string | null | undefined,
): number | undefined {
  if (!dateStr) return undefined;
  const y = parseInt(dateStr.substring(0, 4), 10);
  return Number.isNaN(y) ? undefined : y;
}

export function normalizeWatchProviders(
  raw:
    | Record<
        string,
        { link?: string; flatrate?: unknown[]; rent?: unknown[]; buy?: unknown[] }
      >
    | undefined,
): WatchProvidersByRegion | undefined {
  if (!raw) return undefined;

  const result: WatchProvidersByRegion = {};

  for (const [region, data] of Object.entries(raw)) {
    const mapProviders = (list?: unknown[]): WatchProvider[] | undefined => {
      if (!list || list.length === 0) return undefined;
      return (
        list as Array<{
          provider_id: number;
          provider_name: string;
          logo_path: string;
        }>
      ).map((p) => ({
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
      }));
    };

    const entry: WatchProvidersByRegion[string] = {};
    if (data.link) entry.link = data.link;
    const flatrate = mapProviders(data.flatrate);
    const rent = mapProviders(data.rent);
    const buy = mapProviders(data.buy);
    if (flatrate) entry.flatrate = flatrate;
    if (rent) entry.rent = rent;
    if (buy) entry.buy = buy;

    if (flatrate || rent || buy) {
      result[region] = entry;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/* -------------------------------------------------------------------------- */
/*  TmdbClient — fetch + config                                               */
/* -------------------------------------------------------------------------- */

export class TmdbClient {
  readonly language: string;
  private apiKey: string;
  private baseUrl = "https://api.themoviedb.org/3";

  constructor(apiKey: string, language = "en-US") {
    this.apiKey = apiKey;
    this.language = language;
  }

  /** Build include_image_language param: full locales + 2-letter fallbacks + en + null */
  static buildImageLanguageParam(supportedLangs: string[]): string {
    const codes = new Set<string>(["en", "null"]);
    for (const lang of supportedLangs) {
      codes.add(lang); // full locale (e.g., "pt-BR")
      const short = lang.split("-")[0];
      if (short) codes.add(short); // 2-letter fallback (e.g., "pt")
    }
    return [...codes].join(",");
  }

  async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    // v3 API key as query parameter
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("language", this.language);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText} — ${path} — ${body}`,
      );
    }

    return response.json() as Promise<T>;
  }
}
