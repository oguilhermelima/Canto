import { and, eq, lte, min, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaAspectState } from "@canto/db/schema";

export type MediaAspectStateRow = typeof mediaAspectState.$inferSelect;
export type NewMediaAspectStateRow = typeof mediaAspectState.$inferInsert;

export async function findAspectStates(
  db: Database,
  mediaId: string,
): Promise<MediaAspectStateRow[]> {
  return db
    .select()
    .from(mediaAspectState)
    .where(eq(mediaAspectState.mediaId, mediaId));
}

/**
 * Lookup `succeededAt` for a single (media_id, aspect, scope) row. Returns
 * `null` when the row is missing or has never recorded a successful outcome.
 * Replaces the legacy `media.metadata_updated_at` / `media.extras_updated_at`
 * staleness probes with an aspect-keyed read.
 */
export async function findAspectSucceededAt(
  db: Database,
  mediaId: string,
  aspect: string,
  scope = "",
): Promise<Date | null> {
  const [row] = await db
    .select({ succeededAt: mediaAspectState.succeededAt })
    .from(mediaAspectState)
    .where(
      and(
        eq(mediaAspectState.mediaId, mediaId),
        eq(mediaAspectState.aspect, aspect),
        eq(mediaAspectState.scope, scope),
      ),
    )
    .limit(1);
  return row?.succeededAt ?? null;
}

/**
 * Idempotent bulk insert. Skips rows whose (media_id, aspect, scope) already
 * exists — used by the backfill so re-running the job doesn't clobber state
 * the orchestrator has since updated. Returns the count of rows actually
 * inserted (excludes conflicts) so the caller can report progress.
 */
export async function bulkInsertAspectStates(
  db: Database,
  rows: NewMediaAspectStateRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(mediaAspectState)
    .values(rows)
    .onConflictDoNothing({
      target: [mediaAspectState.mediaId, mediaAspectState.aspect, mediaAspectState.scope],
    })
    .returning({ mediaId: mediaAspectState.mediaId });
  return inserted.length;
}

export async function upsertAspectState(
  db: Database,
  row: NewMediaAspectStateRow,
): Promise<void> {
  const now = new Date();
  await db
    .insert(mediaAspectState)
    .values(row)
    .onConflictDoUpdate({
      target: [mediaAspectState.mediaId, mediaAspectState.aspect, mediaAspectState.scope],
      set: {
        lastAttemptAt: row.lastAttemptAt,
        succeededAt: row.succeededAt ?? null,
        outcome: row.outcome,
        nextEligibleAt: row.nextEligibleAt,
        attempts: row.attempts ?? sql`${mediaAspectState.attempts}`,
        consecutiveFails: row.consecutiveFails ?? sql`${mediaAspectState.consecutiveFails}`,
        materializedSource: row.materializedSource ?? null,
        updatedAt: now,
      },
    });
}

/**
 * Eligible media ids ordered by their soonest-due aspect. Returns DISTINCT
 * media ids so the orchestrator can fan out per-media without re-querying.
 * `before` defaults to now() — pass an explicit cutoff to schedule ahead.
 */
export async function findEligibleMediaIds(
  db: Database,
  opts: { limit: number; before?: Date },
): Promise<string[]> {
  const cutoff = opts.before ?? new Date();
  const rows = await db
    .select({ mediaId: mediaAspectState.mediaId })
    .from(mediaAspectState)
    .where(lte(mediaAspectState.nextEligibleAt, cutoff))
    .groupBy(mediaAspectState.mediaId)
    .orderBy(min(mediaAspectState.nextEligibleAt))
    .limit(opts.limit);
  return rows.map((r) => r.mediaId);
}
