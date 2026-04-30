import { and, eq, lte, min, sql } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { mediaAspectState } from "@canto/db/schema";

import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import {
  toDomain as aspectStateToDomain,
  toInsertRow as aspectStateToInsertRow,
} from "@canto/core/infra/media/media-aspect-state.mapper";

export function makeMediaAspectStateRepository(
  db: Database,
): MediaAspectStateRepositoryPort {
  return {
    findAllForMedia: async (mediaId) => {
      const rows = await db
        .select()
        .from(mediaAspectState)
        .where(eq(mediaAspectState.mediaId, mediaId));
      return rows.map(aspectStateToDomain);
    },

    findSucceededAt: async (mediaId, aspect, scope = "") => {
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
    },

    findEligibleMediaIds: async (opts) => {
      const cutoff = opts.before ?? new Date();
      const rows = await db
        .select({ mediaId: mediaAspectState.mediaId })
        .from(mediaAspectState)
        .where(lte(mediaAspectState.nextEligibleAt, cutoff))
        .groupBy(mediaAspectState.mediaId)
        .orderBy(min(mediaAspectState.nextEligibleAt))
        .limit(opts.limit);
      return rows.map((r) => r.mediaId);
    },

    bulkInsert: async (rows) => {
      if (rows.length === 0) return 0;
      const inserted = await db
        .insert(mediaAspectState)
        .values(rows.map(aspectStateToInsertRow))
        .onConflictDoNothing({
          target: [
            mediaAspectState.mediaId,
            mediaAspectState.aspect,
            mediaAspectState.scope,
          ],
        })
        .returning({ mediaId: mediaAspectState.mediaId });
      return inserted.length;
    },

    upsert: async (row) => {
      const now = new Date();
      const insertRow = aspectStateToInsertRow(row);
      await db
        .insert(mediaAspectState)
        .values(insertRow)
        .onConflictDoUpdate({
          target: [
            mediaAspectState.mediaId,
            mediaAspectState.aspect,
            mediaAspectState.scope,
          ],
          set: {
            lastAttemptAt: insertRow.lastAttemptAt,
            succeededAt: insertRow.succeededAt ?? null,
            outcome: insertRow.outcome,
            nextEligibleAt: insertRow.nextEligibleAt,
            attempts:
              row.attempts !== undefined
                ? insertRow.attempts
                : sql`${mediaAspectState.attempts}`,
            consecutiveFails:
              row.consecutiveFails !== undefined
                ? insertRow.consecutiveFails
                : sql`${mediaAspectState.consecutiveFails}`,
            materializedSource: insertRow.materializedSource ?? null,
            updatedAt: now,
          },
        });
    },
  };
}
