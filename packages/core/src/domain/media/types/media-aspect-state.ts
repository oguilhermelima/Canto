import type { MediaId } from "@canto/core/domain/media/types/media";

/**
 * The different categories of provider-sourced data the cadence engine
 * tracks per media. Mirrors the `aspect` column of `media_aspect_state`.
 */
export type Aspect =
  | "metadata"
  | "structure"
  | "translations"
  | "logos"
  | "extras"
  | "contentRatings";

/**
 * Outcomes recorded against a `media_aspect_state` row. Mirrors the
 * `outcome` column of the table.
 */
export type AspectOutcome =
  | "data"
  | "partial"
  | "empty"
  | "error_4xx"
  | "error_5xx";

/**
 * Domain entity for a `media_aspect_state` row. The composite primary key is
 * `(mediaId, aspect, scope)` — there is no surrogate id. `scope` is empty
 * for non-scoped aspects (`metadata`, `structure`, `extras`, `contentRatings`)
 * and a language code for `translations` / `logos`.
 */
export interface MediaAspectState {
  mediaId: MediaId | string;
  aspect: Aspect | string;
  scope: string;
  lastAttemptAt: Date;
  succeededAt: Date | null;
  outcome: AspectOutcome | string;
  nextEligibleAt: Date;
  attempts: number;
  consecutiveFails: number;
  /** Provider that materialised the row (only set for `structure`). */
  materializedSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Insert/upsert input. `attempts` and `consecutiveFails` may be omitted to
 * preserve the existing values via `COALESCE` in the adapter.
 */
export interface NewMediaAspectState {
  mediaId: string;
  aspect: Aspect | string;
  scope: string;
  lastAttemptAt: Date;
  succeededAt?: Date | null;
  outcome: AspectOutcome | string;
  nextEligibleAt: Date;
  attempts?: number;
  consecutiveFails?: number;
  materializedSource?: string | null;
}

/**
 * Patch shape for updates that only touch a subset of columns. Today every
 * caller writes the full row, but the type is exposed so future callers can
 * avoid clobbering fields like `consecutiveFails`.
 */
export interface MediaAspectStatePatch {
  lastAttemptAt?: Date;
  succeededAt?: Date | null;
  outcome?: AspectOutcome | string;
  nextEligibleAt?: Date;
  attempts?: number;
  consecutiveFails?: number;
  materializedSource?: string | null;
}
