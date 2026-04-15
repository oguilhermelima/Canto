import type {
  media,
  mediaFile,
} from "@canto/db/schema";
import type { ListInput } from "@canto/validators";

type MediaRow = typeof media.$inferSelect;
type MediaInsert = typeof media.$inferInsert;

export interface MediaRepositoryPort {
  findMediaById(id: string): Promise<MediaRow | undefined>;

  findMediaByIdWithSeasons(
    id: string,
  ): Promise<(MediaRow & { seasons: Array<{ number: number; episodes: Array<{ number: number }> }> }) | undefined>;

  findMediaByExternalId(
    externalId: number,
    provider: string,
    type: string,
  ): Promise<(MediaRow & { seasons: Array<{ number: number; episodes: Array<{ number: number }> }> }) | undefined>;

  findMediaByAnyReference(
    externalId: number,
    provider: string,
    imdbId?: string,
    tvdbId?: number,
    type?: string,
  ): Promise<(MediaRow & { seasons: Array<{ number: number; episodes: Array<{ number: number }> }> }) | null>;

  updateMedia(
    id: string,
    data: Partial<MediaInsert>,
  ): Promise<MediaRow | undefined>;

  deleteMedia(id: string): Promise<MediaRow | undefined>;

  findLibraryExternalIds(): Promise<
    Array<{ externalId: number; provider: string }>
  >;

  findLibraryMediaBrief(
    limit?: number,
  ): Promise<Array<{ id: string; externalId: number; provider: string; type: string }>>;

  findLibraryStats(): Promise<{
    total: number;
    movies: number;
    shows: number;
    storageBytes: bigint;
  }>;

  listLibraryMedia(
    input: ListInput,
  ): Promise<{ items: MediaRow[]; total: number; page: number; pageSize: number }>;
}
