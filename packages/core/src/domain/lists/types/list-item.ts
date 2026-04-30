import type { ListType } from "@canto/core/domain/lists/types/list";

export type ListItemId = string & { readonly __brand: "ListItemId" };

/** Records who tombstoned a list item. Used for forensic queries on the
 *  per-item history (e.g. distinguishing a Trakt-sync deletion from a
 *  user-initiated remove). */
export type ListItemActor = "user" | "trakt-sync" | "move";

export interface ListItem {
  id: ListItemId;
  listId: string;
  mediaId: string;
  addedAt: Date;
  position: number;
  notes: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  lastPushedAt: Date | null;
}

export interface NewListItem {
  listId: string;
  mediaId: string;
  notes?: string | null;
}

/** Projection used by the "in N other collections" hint on collection cards
 *  — flattens listItem ⨝ list to the fields needed by the picker UI. */
export interface MediaInListSummary {
  listId: string;
  listName: string;
  listSlug: string;
  listType: ListType;
}

/** Localized media projection returned by list/collection item queries.
 *  Spreads all `media` table columns plus the per-language overlay from
 *  `media_localization`. Used by `findListItems` and
 *  `findUserCustomCollectionItems` in the lists repository port. */
export interface ListItemMedia {
  id: string;
  type: string;
  externalId: number;
  provider: string;
  originalTitle: string | null;
  originalLanguage: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  lastAirDate: string | null;
  status: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
  contentRating: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  runtime: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  inProduction: boolean | null;
  title: string;
  overview: string | null;
  posterPath: string | null;
  logoPath: string | null;
  tagline: string | null;
  [key: string]: unknown;
}

/** Aggregated member-vote stats on a list item (shared-collection feature). */
export interface MemberVotes {
  totalRating: number;
  voteCount: number;
  avgRating: number;
}

/** Minimal collection entry as returned by the membership-lookup helper. */
export interface CollectionRef {
  id: string;
  name: string;
  slug: string;
}

/** Which lists a media item already belongs to, surfaced in the picker UI. */
export interface MediaMembership {
  inWatchlist: boolean;
  otherCollections: CollectionRef[];
}

/** Full list-item row joined with localized media + optional member-votes,
 *  per-user rating/status, and multi-list membership hint. Returned by
 *  `ListsRepositoryPort.findListItems`. */
export interface ListItemDetail {
  listItem: ListItem;
  media: ListItemMedia;
  memberVotes: MemberVotes | null;
  userRating: number | null;
  userStatus: string | null;
  membership: MediaMembership;
}

/** Lighter projection for the combined-collection view — no listItem row,
 *  no member-votes. Returned by
 *  `ListsRepositoryPort.findUserCustomCollectionItems`. */
export interface CollectionItemDetail {
  media: ListItemMedia;
  userRating: number | null;
  membership: MediaMembership;
}
