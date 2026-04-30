import type {
  Aspect,
  AspectOutcome,
  MediaAspectState,
  NewMediaAspectState,
} from "@canto/core/domain/media/types/media-aspect-state";
import type { mediaAspectState } from "@canto/db/schema";

type Row = typeof mediaAspectState.$inferSelect;
type Insert = typeof mediaAspectState.$inferInsert;

export function toDomain(row: Row): MediaAspectState {
  return {
    mediaId: row.mediaId,
    aspect: row.aspect as Aspect,
    scope: row.scope,
    lastAttemptAt: row.lastAttemptAt,
    succeededAt: row.succeededAt,
    outcome: row.outcome as AspectOutcome,
    nextEligibleAt: row.nextEligibleAt,
    attempts: row.attempts,
    consecutiveFails: row.consecutiveFails,
    materializedSource: row.materializedSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Convert a domain insert payload into the schema row shape. `attempts` and
 * `consecutiveFails` default to 0 to match the column defaults — callers
 * that want to preserve existing values pass them through explicitly via the
 * `upsertAspectState` adapter (which uses `COALESCE`-style merging).
 */
export function toInsertRow(input: NewMediaAspectState): Insert {
  return {
    mediaId: input.mediaId,
    aspect: input.aspect,
    scope: input.scope,
    lastAttemptAt: input.lastAttemptAt,
    succeededAt: input.succeededAt ?? null,
    outcome: input.outcome,
    nextEligibleAt: input.nextEligibleAt,
    attempts: input.attempts ?? 0,
    consecutiveFails: input.consecutiveFails ?? 0,
    materializedSource: input.materializedSource ?? null,
  };
}
