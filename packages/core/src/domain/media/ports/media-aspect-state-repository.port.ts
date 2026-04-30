import type {
  Aspect,
  MediaAspectState,
  NewMediaAspectState,
} from "@canto/core/domain/media/types/media-aspect-state";

/**
 * Port for the cadence engine's per-(mediaId, aspect, scope) state table.
 * Reads tell the planner what's stale; writes record post-execution outcomes
 * with the next eligibility window.
 *
 * Wave 9B scope: every operation that touches `media_aspect_state` flows
 * through this port. The pure-function planners (`computePlan`,
 * `computeNextEligible`, `effectiveProvider`) consume `MediaAspectState[]`
 * and never reach back to the DB.
 */
export interface MediaAspectStateRepositoryPort {
  // ─── Reads ───

  /** Every aspect-state row for a media (all aspects, all scopes). */
  findAllForMedia(mediaId: string): Promise<MediaAspectState[]>;

  /**
   * `succeededAt` for a single `(mediaId, aspect, scope)` row. Returns
   * `null` when the row is missing or has never recorded a successful
   * outcome. Replaces the legacy `media.metadata_updated_at` /
   * `media.extras_updated_at` staleness probes with an aspect-keyed read.
   */
  findSucceededAt(
    mediaId: string,
    aspect: Aspect | string,
    scope?: string,
  ): Promise<Date | null>;

  /**
   * Eligible media ids ordered by their soonest-due aspect. Returns DISTINCT
   * media ids so the orchestrator can fan out per-media without re-querying.
   * `before` defaults to now() — pass an explicit cutoff to schedule ahead.
   */
  findEligibleMediaIds(opts: {
    limit: number;
    before?: Date;
  }): Promise<string[]>;

  // ─── Writes ───

  /**
   * Idempotent bulk insert. Skips rows whose `(mediaId, aspect, scope)`
   * already exists — used by the backfill so re-running the job doesn't
   * clobber state the orchestrator has since updated. Returns the count of
   * rows actually inserted (excludes conflicts).
   */
  bulkInsert(rows: NewMediaAspectState[]): Promise<number>;

  /**
   * Single-row upsert keyed on `(mediaId, aspect, scope)`. Updates every
   * relevant column including `attempts`, `consecutiveFails`, and the
   * `materializedSource` provider tag for `structure` rows.
   */
  upsert(row: NewMediaAspectState): Promise<void>;
}
