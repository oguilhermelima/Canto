/**
 * HTTP-shape types for the Trakt API. Mirrors what `trakt.adapter` returns
 * over the wire after light normalization (snake_case → camelCase, drop
 * irrelevant fields). Owned by the domain so the `TraktApiPort` can stay
 * dependency-free of the infra layer.
 */

export interface TraktOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TraktDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface TraktUserSettingsResponse {
  user: {
    username: string;
    ids: {
      slug: string;
      trakt: number | null;
      uuid: string;
    };
  };
}

export interface TraktIds {
  trakt?: number;
  slug?: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface TraktMediaRef {
  type: "movie" | "show";
  ids: TraktIds;
  listedAt?: string;
  ratedAt?: string;
  watchedAt?: string;
  rating?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface TraktListSummary {
  name: string;
  description?: string | null;
  updated_at: string;
  ids: {
    trakt: number;
    slug: string;
  };
}

export interface TraktPlaybackProgressRef {
  type: "movie" | "show";
  ids: TraktIds;
  pausedAt: string;
  progressPercent: number;
  runtimeMinutes: number | null;
  seasonNumber?: number;
  episodeNumber?: number;
  remotePlaybackId: number;
}

export interface TraktLastActivities {
  /** Latest movie watch — drives /sync/watched/movies. */
  moviesWatchedAt: string | null;
  /** Latest episode watch — drives /sync/watched/shows. */
  episodesWatchedAt: string | null;
  /** Either side moving means there's new history. */
  historyAt: string | null;
  watchlistAt: string | null;
  /** Max across movies/shows/seasons/episodes ratings. */
  ratingsAt: string | null;
  favoritesAt: string | null;
  listsAt: string | null;
  /** Max paused_at across movies/episodes. */
  playbackAt: string | null;
}

export interface TraktWatchedMovie {
  ids: TraktIds;
  plays: number;
  lastWatchedAt: string;
}

export interface TraktWatchedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  plays: number;
  lastWatchedAt: string;
}



export interface TraktWatchedShow {
  ids: TraktIds;
  plays: number;
  lastWatchedAt: string;
  episodes: TraktWatchedEpisode[];
}

export type TraktListRequestBody = {
  movies?: Array<{ ids: TraktIds; watched_at?: string }>;
  shows?: Array<{
    ids: TraktIds;
    watched_at?: string;
    seasons?: Array<{
      number: number;
      watched_at?: string;
      episodes: Array<{ number: number; watched_at?: string }>;
    }>;
  }>;
  seasons?: Array<{ ids: TraktIds; watched_at?: string }>;
  episodes?: Array<{ ids: TraktIds; watched_at?: string }>;
};

export type TraktRatingsRequestBody = {
  movies?: Array<{ ids: TraktIds; rating: number }>;
  shows?: Array<{ ids: TraktIds; rating: number }>;
  seasons?: Array<{ ids: TraktIds; rating: number }>;
  episodes?: Array<{ ids: TraktIds; rating: number }>;
};

export type TraktRatingsRemoveRequestBody = {
  movies?: Array<{ ids: TraktIds }>;
  shows?: Array<{ ids: TraktIds }>;
  seasons?: Array<{ ids: TraktIds }>;
  episodes?: Array<{ ids: TraktIds }>;
};

export type TraktFavoritesRequestBody = {
  movies?: Array<{ ids: TraktIds }>;
  shows?: Array<{ ids: TraktIds }>;
};

export interface TraktConnectionCredentials {
  id: string;
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface TraktRefreshPersistPatch {
  token: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  staleReason: null;
}

export type TraktPingResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };
