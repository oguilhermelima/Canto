import type {
  blocklist,
  media,
  mediaCredit,
  mediaVideo,
  mediaWatchProvider,
} from "@canto/db/schema";
import type { RecsFilters } from "./user-recommendation-repository.port";

type MediaRow = typeof media.$inferSelect;
type MediaCreditRow = typeof mediaCredit.$inferSelect;
type MediaVideoRow = typeof mediaVideo.$inferSelect;
type MediaWatchProviderRow = typeof mediaWatchProvider.$inferSelect;
type BlocklistRow = typeof blocklist.$inferSelect;
type BlocklistInsert = typeof blocklist.$inferInsert;

export interface ExtrasRepositoryPort {
  findCreditsByMediaId(mediaId: string): Promise<MediaCreditRow[]>;
  findVideosByMediaId(mediaId: string): Promise<MediaVideoRow[]>;
  findWatchProvidersByMediaId(mediaId: string): Promise<MediaWatchProviderRow[]>;

  findRecommendationsBySource(
    sourceMediaId: string,
    sourceType: string,
  ): Promise<
    Array<{
      id: string;
      externalId: number;
      provider: string;
      mediaType: string;
      title: string;
      overview: string | null;
      posterPath: string | null;
      backdropPath: string | null;
      logoPath: string | null;
      releaseDate: string | null;
      voteAverage: number | null;
    }>
  >;

  findRecommendedMediaWithBackdrops(limit: number): Promise<MediaRow[]>;

  findGlobalRecommendations(
    excludeItems: Array<{ externalId: number; provider: string }>,
    limit: number,
    offset: number,
    filters?: RecsFilters,
  ): Promise<MediaRow[]>;

  findBlocklistByMediaId(mediaId: string): Promise<Array<{ title: string }>>;

  findBlocklistEntry(
    mediaId: string,
    title: string,
  ): Promise<BlocklistRow | undefined>;

  createBlocklistEntry(data: BlocklistInsert): Promise<BlocklistRow | undefined>;

  findWatchProviderLinks(): Promise<
    Array<{ providerId: number; searchUrlTemplate: string | null }>
  >;
}
