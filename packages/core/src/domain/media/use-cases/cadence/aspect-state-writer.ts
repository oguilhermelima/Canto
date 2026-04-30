import type { ProviderName } from "@canto/providers";

import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type {
  Aspect,
  MediaAspectState,
} from "@canto/core/domain/media/types/media-aspect-state";
import type { EnsureMediaSpec } from "@canto/core/domain/media/use-cases/ensure-media.types";
import type { CadenceKnobs } from "@canto/core/domain/media/use-cases/cadence/cadence-knobs";
import {
  computeNextEligible,
  type MediaContext,
  type Outcome,
} from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";
import type {
  ForcedAspect,
  PlanItem,
} from "@canto/core/domain/media/use-cases/cadence/compute-plan";

/** Shape of a media row that the cadence integration cares about. */
export interface CadenceMediaRow {
  type: string;
  provider: string;
  overrideProviderFor: string | null;
  releaseDate: string | Date | null;
  nextAirDate: string | Date | null;
}

/**
 * Build the minimal `MediaContext` used by `computeNextEligible` and
 * `computePlan` from a raw media row. Centralised so every caller maps the
 * Drizzle `date()` columns the same way.
 */
export function buildMediaContext(mediaRow: CadenceMediaRow): MediaContext {
  return {
    type: mediaRow.type as "movie" | "show",
    releaseDate: parseDateColumn(mediaRow.releaseDate),
    nextEpisodeAirAt: parseDateColumn(mediaRow.nextAirDate),
  };
}

/** Drizzle `date()` columns surface as ISO strings — convert to `Date | null`. */
export function parseDateColumn(
  value: string | Date | null | undefined,
): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Extract unique non-empty scopes for a given aspect from a list of plan
 * items. Used by `ensureMedia` to derive the language fan-out for
 * translations and logos without re-scanning state.
 */
export function scopesFor(items: PlanItem[], aspect: Aspect): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.aspect !== aspect) continue;
    if (item.scope.length === 0) continue;
    if (seen.has(item.scope)) continue;
    seen.add(item.scope);
    out.push(item.scope);
  }
  return out;
}

/**
 * Persist the post-execution outcome of an aspect run via the repository
 * port. Computes the next eligibility window via `computeNextEligible`,
 * increments the attempt and consecutive-fail counters, and pins
 * `materialized_source` on `structure` rows so the planner can detect
 * provider migrations on the next pass.
 *
 * `stateByKey` is the snapshot read at the start of `ensureMedia`; passing
 * it in (rather than re-querying) keeps each upsert pure-ish and avoids a
 * second round-trip per aspect.
 */
export async function writeAspectState(opts: {
  aspectState: MediaAspectStateRepositoryPort;
  mediaId: string;
  aspect: Aspect;
  scope: string;
  outcome: Outcome;
  ctx: MediaContext;
  knobs: CadenceKnobs;
  stateByKey: Map<string, MediaAspectState>;
  now: Date;
  provider: ProviderName;
}): Promise<void> {
  const {
    aspectState,
    mediaId,
    aspect,
    scope,
    outcome,
    ctx,
    knobs,
    stateByKey,
    now,
    provider,
  } = opts;
  const prev = stateByKey.get(stateKey(aspect, scope));
  const consecutiveFails = outcome.startsWith("error")
    ? (prev?.consecutiveFails ?? 0) + 1
    : 0;
  const nextEligibleAt = computeNextEligible(
    { aspect, consecutive_fails: consecutiveFails },
    outcome,
    ctx,
    knobs,
    now,
  );
  await aspectState.upsert({
    mediaId,
    aspect,
    scope,
    lastAttemptAt: now,
    succeededAt: outcome === "data" ? now : (prev?.succeededAt ?? null),
    outcome,
    nextEligibleAt,
    attempts: (prev?.attempts ?? 0) + 1,
    consecutiveFails,
    materializedSource:
      aspect === "structure"
        ? provider
        : (prev?.materializedSource ?? null),
  });
}

/**
 * Translate caller-facing `EnsureMediaSpec` into the plan engine's
 * `ForcedAspect[]` shape. Returns `undefined` when the caller has not asked
 * to force anything — `computePlan` treats `undefined` as "no overrides".
 *
 * `translations` and `logos` expand per language because their state rows
 * are scoped by language code; everything else uses the empty-string scope.
 */
export function buildForceAspects(
  spec: EnsureMediaSpec,
  activeLanguages: string[],
): ForcedAspect[] | undefined {
  if (!spec.aspects || spec.aspects.length === 0) return undefined;
  const langs = spec.languages ?? activeLanguages;
  const out: ForcedAspect[] = [];
  for (const aspect of spec.aspects) {
    if (aspect === "translations" || aspect === "logos") {
      for (const lang of langs) out.push({ aspect, scope: lang });
    } else {
      out.push({ aspect });
    }
  }
  return out;
}

/**
 * Best-effort classification of a thrown provider error into the cadence
 * `Outcome` enum. Most provider errors carry a numeric `status`/`statusCode`
 * field; everything else is treated as 5xx so transient flakes get a
 * backoff instead of permanently parking the row.
 */
export function classifyError(err: unknown): Outcome {
  if (typeof err !== "object" || err === null) return "error_5xx";
  const candidate = err as { status?: number; statusCode?: number };
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return "error_4xx";
  }
  return "error_5xx";
}

/** Stable key for the `(aspect, scope)` tuple used by `media_aspect_state`. */
export function stateKey(aspect: Aspect, scope: string): string {
  return `${aspect}::${scope}`;
}
