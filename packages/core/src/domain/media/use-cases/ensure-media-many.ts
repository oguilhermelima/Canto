import type { Database } from "@canto/db/client";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { detectGaps } from "@canto/core/domain/media/use-cases/detect-gaps";
import {
  ALL_ASPECTS,
  type Aspect,
  type EnsureMediaSpec,
} from "@canto/core/domain/media/use-cases/ensure-media.types";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { dispatchEnsureMedia } from "@canto/core/platform/queue/bullmq-dispatcher";

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

export interface EnsureMediaManyDeps {
  /** Optional — falls back to building from `db` when not supplied. */
  media?: MediaRepositoryPort;
}

/**
 * Bulk orchestrator. Enumerates media per the filter, runs gap detection for
 * each, and enqueues `ensureMedia` jobs for the ones that need work.
 *
 * Caller drives scope via the filter. Nothing in this function is eager —
 * actual fetches happen asynchronously in the worker.
 *
 * Wave 9C2: row enumeration moved behind
 * `MediaRepositoryPort.findEligibleForEnrichment` so this orchestrator no
 * longer reaches into the `media` table directly.
 */
export async function ensureMediaMany(
  db: Database,
  filter: EnsureMediaManyFilter,
  spec: EnsureMediaSpec = {},
  opts: EnsureMediaManyOptions = {},
  deps: EnsureMediaManyDeps = {},
): Promise<EnsureMediaManyResult> {
  const languages = spec.languages ?? [...(await getActiveUserLanguages(db))];
  const mediaRepo = deps.media ?? makeMediaRepository(db);

  const rows = await mediaRepo.findEligibleForEnrichment({
    mediaIds: filter.mediaIds,
    type: filter.type,
    hasTvdbId: filter.hasTvdbId,
    onlyInLibrary: filter.onlyInLibrary,
  });

  const byAspect: Record<Aspect, number> = {
    metadata: 0,
    structure: 0,
    translations: 0,
    logos: 0,
    extras: 0,
    contentRatings: 0,
  };
  const byLanguage: Record<string, number> = {};

  let dispatched = 0;
  let skipped = 0;

  for (const row of rows) {
    // Skip gap detection when caller forces a refresh: explicit aspects when
    // provided, otherwise refetch every aspect. Gap detection is read-only and
    // wouldn't catch already-populated-but-stale data (e.g. wrong-language
    // posters that we want to overwrite).
    let aspectsToDispatch: Aspect[];
    if (spec.force) {
      aspectsToDispatch =
        spec.aspects && spec.aspects.length > 0 ? spec.aspects : ALL_ASPECTS;
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
