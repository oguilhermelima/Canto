/** Branded id for the `blocklist` table. */
export type BlocklistEntryId = string & { readonly __brand: "BlocklistEntryId" };

/** Reasons we record for a blocklist entry — purely informational, no enforcement logic depends on the value. */
export type BlocklistReason = "stalled" | "failed" | "bad_quality" | "manual" | string;

export interface BlocklistEntry {
  id: BlocklistEntryId;
  mediaId: string;
  title: string;
  indexer: string | null;
  reason: BlocklistReason;
  createdAt: Date;
}

export interface NewBlocklistEntry {
  mediaId: string;
  title: string;
  indexer?: string | null;
  reason: BlocklistReason;
}
