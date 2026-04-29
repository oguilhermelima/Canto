import { asc, gt, inArray } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, season } from "@canto/db/schema";
import {
  bulkInsertAspectStates,
  type NewMediaAspectStateRow,
} from "../../../infra/media/media-aspect-state-repository";
import {
  buildMediaContext,
  computeNextEligible,
  loadCadenceKnobs,
  type CadenceKnobs,
  type Outcome,
} from "./cadence";

export interface BackfillAspectStateResult {
  mediasProcessed: number;
  rowsInserted: number;
}

const BATCH_SIZE = 1000;

interface MediaBatchRow {
  id: string;
  type: string;
  provider: string;
  createdAt: Date;
  metadataUpdatedAt: Date | null;
  extrasUpdatedAt: Date | null;
  releaseDate: string | null;
  nextAirDate: string | null;
  overrideProviderFor: string | null;
}

/**
 * Seed `media_aspect_state` from existing media rows so the orchestrator has
 * a concrete starting point on first deploy. Phase 1A only — covers metadata,
 * extras, and (for shows) structure. Translations/logos/contentRatings are
 * left to lazy discovery.
 *
 * `next_eligible_at` is computed via the cadence engine using the same
 * outcome we record (`data` when an updated-at timestamp exists, otherwise
 * `empty`) so the orchestrator's first sweep doesn't re-fetch every healthy
 * row at once. Idempotent: re-running over the same medias inserts nothing
 * because of the (media_id, aspect, scope) primary key + ON CONFLICT DO
 * NOTHING.
 */
export async function backfillAspectState(
  db: Database,
): Promise<BackfillAspectStateResult> {
  const result: BackfillAspectStateResult = {
    mediasProcessed: 0,
    rowsInserted: 0,
  };

  const knobs = await loadCadenceKnobs(db);
  const now = new Date();

  let cursor: string | null = null;

  while (true) {
    const batch: MediaBatchRow[] = await db
      .select({
        id: media.id,
        type: media.type,
        provider: media.provider,
        createdAt: media.createdAt,
        metadataUpdatedAt: media.metadataUpdatedAt,
        extrasUpdatedAt: media.extrasUpdatedAt,
        releaseDate: media.releaseDate,
        nextAirDate: media.nextAirDate,
        overrideProviderFor: media.overrideProviderFor,
      })
      .from(media)
      .where(cursor === null ? undefined : gt(media.id, cursor))
      .orderBy(asc(media.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    const showIds = batch.filter((m) => m.type === "show").map((m) => m.id);
    const showsWithSeasons = await findShowsWithSeasons(db, showIds);

    const rows = buildBatchRows(batch, showsWithSeasons, knobs, now);
    const inserted = await bulkInsertAspectStates(db, rows);

    result.mediasProcessed += batch.length;
    result.rowsInserted += inserted;

    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1]!.id;
  }

  return result;
}

async function findShowsWithSeasons(
  db: Database,
  showIds: string[],
): Promise<Set<string>> {
  if (showIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ mediaId: season.mediaId })
    .from(season)
    .where(inArray(season.mediaId, showIds));
  return new Set(rows.map((r) => r.mediaId));
}

function buildBatchRows(
  batch: MediaBatchRow[],
  showsWithSeasons: Set<string>,
  knobs: CadenceKnobs,
  now: Date,
): NewMediaAspectStateRow[] {
  const rows: NewMediaAspectStateRow[] = [];

  for (const m of batch) {
    const ctx = buildMediaContext({
      type: m.type,
      provider: m.provider,
      overrideProviderFor: m.overrideProviderFor,
      releaseDate: m.releaseDate,
      nextAirDate: m.nextAirDate,
    });

    const metadataOutcome: Outcome = m.metadataUpdatedAt ? "data" : "empty";
    rows.push({
      mediaId: m.id,
      aspect: "metadata",
      scope: "",
      lastAttemptAt: m.metadataUpdatedAt ?? m.createdAt,
      succeededAt: m.metadataUpdatedAt,
      outcome: metadataOutcome,
      nextEligibleAt: computeNextEligible(
        { aspect: "metadata", consecutive_fails: 0 },
        metadataOutcome,
        ctx,
        knobs,
        now,
      ),
      materializedSource: null,
    });

    const extrasOutcome: Outcome = m.extrasUpdatedAt ? "data" : "empty";
    rows.push({
      mediaId: m.id,
      aspect: "extras",
      scope: "",
      lastAttemptAt: m.extrasUpdatedAt ?? m.createdAt,
      succeededAt: m.extrasUpdatedAt,
      outcome: extrasOutcome,
      nextEligibleAt: computeNextEligible(
        { aspect: "extras", consecutive_fails: 0 },
        extrasOutcome,
        ctx,
        knobs,
        now,
      ),
      materializedSource: null,
    });

    if (m.type === "show") {
      const hasSeasons = showsWithSeasons.has(m.id);
      const structureOutcome: Outcome = hasSeasons ? "data" : "empty";
      rows.push({
        mediaId: m.id,
        aspect: "structure",
        scope: "",
        // Best-effort timestamp: we don't track when seasons were ingested,
        // so anchor to createdAt and mark succeededAt = now() if any season
        // exists. The orchestrator will recalc on first real run.
        lastAttemptAt: m.createdAt,
        succeededAt: hasSeasons ? now : null,
        outcome: structureOutcome,
        nextEligibleAt: computeNextEligible(
          { aspect: "structure", consecutive_fails: 0 },
          structureOutcome,
          ctx,
          knobs,
          now,
        ),
        materializedSource: m.provider === "tvdb" ? "tvdb" : "tmdb",
      });
    }
  }

  return rows;
}
