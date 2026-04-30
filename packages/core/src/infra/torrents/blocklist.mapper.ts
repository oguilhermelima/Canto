import type {
  BlocklistEntry,
  BlocklistEntryId,
  NewBlocklistEntry,
} from "@canto/core/domain/torrents/types/blocklist";
import type { blocklist } from "@canto/db/schema";

type Row = typeof blocklist.$inferSelect;
type Insert = typeof blocklist.$inferInsert;

export function toDomain(row: Row): BlocklistEntry {
  return {
    id: row.id as BlocklistEntryId,
    mediaId: row.mediaId,
    title: row.title,
    indexer: row.indexer,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

export function toRow(input: NewBlocklistEntry): Insert {
  return {
    mediaId: input.mediaId,
    title: input.title,
    indexer: input.indexer ?? null,
    reason: input.reason,
  };
}
