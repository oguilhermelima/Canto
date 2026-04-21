import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media } from "@canto/db/schema";
import { detectGaps } from "../detect-gaps";
import { getActiveUserLanguages } from "../../services/user-service";
import { dispatchEnsureMedia } from "../../../infrastructure/queue/bullmq-dispatcher";
import type { Aspect, EnsureMediaSpec } from "./ensure-media.types";

export interface EnsureMediaManyFilter {
  mediaIds?: string[];
  type?: "movie" | "show";
  hasTvdbId?: boolean;
  onlyInLibrary?: boolean;
}

export interface EnsureMediaManyOptions {
  /** Don't dispatch; just report what would be dispatched. */
  dryRun?: boolean;
}

export interface EnsureMediaManyResult {
  dispatched: number;
  skipped: number;
  byAspect: Record<Aspect, number>;
  byLanguage: Record<string, number>;
}

/**
 * Bulk orchestrator. Enumerates media per the filter, runs gap detection for
 * each, and enqueues `ensureMedia` jobs for the ones that need work.
 *
 * Caller drives scope via the filter. Nothing in this function is eager —
 * actual fetches happen asynchronously in the worker.
 */
export async function ensureMediaMany(
  db: Database,
  filter: EnsureMediaManyFilter,
  spec: EnsureMediaSpec = {},
  opts: EnsureMediaManyOptions = {},
): Promise<EnsureMediaManyResult> {
  const languages = spec.languages ?? [...(await getActiveUserLanguages(db))];

  const conditions: SQL[] = [];
  if (filter.mediaIds && filter.mediaIds.length > 0) {
    conditions.push(inArray(media.id, filter.mediaIds));
  }
  if (filter.type) conditions.push(eq(media.type, filter.type));
  if (filter.hasTvdbId) conditions.push(isNotNull(media.tvdbId));
  if (filter.onlyInLibrary) conditions.push(eq(media.inLibrary, true));

  const rows = await db
    .select({ id: media.id, type: media.type, tvdbId: media.tvdbId })
    .from(media)
    .where(conditions.length > 0 ? and(...conditions) : sql`TRUE`);

  const byAspect: Record<Aspect, number> = {
    metadata: 0,
    structure: 0,
    translations: 0,
    logos: 0,
    extras: 0,
  };
  const byLanguage: Record<string, number> = {};

  let dispatched = 0;
  let skipped = 0;

  for (const row of rows) {
    // If caller gave explicit aspects and force, skip gap detection.
    let aspectsToDispatch: Aspect[];
    if (spec.force && spec.aspects && spec.aspects.length > 0) {
      aspectsToDispatch = spec.aspects;
    } else {
      const gaps = await detectGaps(db, row.id, languages);
      aspectsToDispatch = spec.aspects
        ? spec.aspects.filter((a) => gaps.gaps.includes(a))
        : gaps.gaps;
    }

    if (aspectsToDispatch.length === 0) {
      skipped += 1;
      continue;
    }

    for (const aspect of aspectsToDispatch) byAspect[aspect] += 1;
    for (const lang of languages) {
      byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
    }

    if (!opts.dryRun) {
      await dispatchEnsureMedia(row.id, {
        languages,
        aspects: aspectsToDispatch,
        force: spec.force,
      });
    }
    dispatched += 1;
  }

  return { dispatched, skipped, byAspect, byLanguage };
}
