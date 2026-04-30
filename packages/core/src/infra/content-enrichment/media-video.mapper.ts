import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  MediaVideo,
  MediaVideoId,
  NewMediaVideo,
} from "@canto/core/domain/media/types/media-video";
import type { mediaVideo } from "@canto/db/schema";

type Row = typeof mediaVideo.$inferSelect;
type Insert = typeof mediaVideo.$inferInsert;

export function toDomain(row: Row): MediaVideo {
  return {
    id: row.id as MediaVideoId,
    mediaId: row.mediaId as MediaId,
    externalKey: row.externalKey,
    site: row.site,
    name: row.name,
    type: row.type,
    official: row.official,
    language: row.language,
    publishedAt: row.publishedAt,
  };
}

export function toRow(input: NewMediaVideo): Insert {
  return {
    mediaId: input.mediaId,
    externalKey: input.externalKey,
    site: input.site,
    name: input.name,
    type: input.type,
    official: input.official ?? true,
    language: input.language ?? null,
    publishedAt: input.publishedAt ?? null,
  };
}
