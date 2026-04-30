/**
 * `userHiddenMedia` is keyed by (userId, externalId, provider) — an
 * externalId-based hide that works for any TMDB item, not just persisted
 * media. PK lives on those three columns; there is no surrogate id.
 */
export interface UserHiddenMedia {
  userId: string;
  externalId: number;
  provider: string;
  type: string;
  title: string;
  posterPath: string | null;
  createdAt: Date;
}

export interface HideMediaInput {
  userId: string;
  externalId: number;
  provider: string;
  type: string;
  title: string;
  posterPath?: string | null;
}

export interface UnhideMediaInput {
  userId: string;
  externalId: number;
  provider: string;
}

export interface UserHiddenMediaRef {
  externalId: number;
  provider: string;
}
