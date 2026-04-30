import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  MediaWatchProvider,
  MediaWatchProviderId,
  NewMediaWatchProvider,
} from "@canto/core/domain/media/types/media-watch-provider";
import type { mediaWatchProvider } from "@canto/db/schema";

type Row = typeof mediaWatchProvider.$inferSelect;
type Insert = typeof mediaWatchProvider.$inferInsert;

export function toDomain(row: Row): MediaWatchProvider {
  return {
    id: row.id as MediaWatchProviderId,
    mediaId: row.mediaId as MediaId,
    providerId: row.providerId,
    providerName: row.providerName,
    logoPath: row.logoPath,
    type: row.type,
    region: row.region,
  };
}

export function toRow(input: NewMediaWatchProvider): Insert {
  return {
    mediaId: input.mediaId,
    providerId: input.providerId,
    providerName: input.providerName,
    logoPath: input.logoPath ?? null,
    type: input.type,
    region: input.region,
  };
}
