import type { ProviderName } from "@canto/providers";

import type {
  Aspect,
  MediaAspectState,
} from "@canto/core/domain/media/types/media-aspect-state";
import type { CadenceKnobs } from "@canto/core/domain/media/use-cases/cadence/cadence-knobs";
import type { MediaContext } from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";

/**
 * One enrichment task to run. `force: true` bypasses freshness checks so the
 * downstream engine ignores `next_eligible_at` for this aspect.
 */
export interface PlanItem {
  aspect: Aspect;
  scope: string;
  force?: boolean;
}

/**
 * Plan returned to the orchestrator. Empty `items` means "nothing to do".
 * `reason` is populated for observability when the engine forces work that
 * was not strictly due (e.g. provider migration).
 */
export interface EnrichmentPlan {
  items: PlanItem[];
  reason?: string;
}

export type CadenceSignal = "discovered" | "visited" | "periodic" | "forced";

export interface ForcedAspect {
  aspect: Aspect;
  scope?: string;
}

export interface ComputePlanInput {
  state: MediaAspectState[];
  ctx: MediaContext;
  signal: CadenceSignal;
  activeLanguages: string[];
  effectiveProvider: ProviderName;
  forceAspects?: ForcedAspect[];
  knobs: CadenceKnobs;
  now: Date;
}

const TRANSLATION_ASPECT: Aspect = "translations";
const STRUCTURE_ASPECT: Aspect = "structure";
const LOGOS_ASPECT: Aspect = "logos";

/**
 * Decide which (aspect, scope) tuples need work for a single media row.
 * Pure — no DB or provider calls.
 *
 * Inputs that drive the plan:
 *  - `state`: the current `media_aspect_state` rows for this media.
 *  - `ctx`: minimal media context (type + scheduling dates).
 *  - `signal`: where the trigger came from. Only `forced` actually skips
 *    cadence today, but downstream callers can use the signal for logging.
 *  - `activeLanguages`: drives translation aspect scopes.
 *  - `effectiveProvider`: compared against `state.materialized_source` on the
 *    structure row to detect a provider migration.
 *  - `forceAspects`: caller-provided overrides.
 *
 * Behaviour:
 *  1. Force entries (caller `forceAspects` OR a structure source migration)
 *     produce `force: true` items.
 *  2. Translation rows that are missing for an active language are added as
 *     forced items with no underlying state row.
 *  3. Existing state rows whose `nextEligibleAt <= now` are added without force.
 */
export function computePlan(input: ComputePlanInput): EnrichmentPlan {
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  const reasons: string[] = [];

  const forceMap = buildForceMap(input.forceAspects);

  // 1. Source migration: when the structure row's materialised source no
  //    longer matches the effective provider, every translation row is also
  //    invalidated because episode IDs change between providers.
  const migration = detectSourceMigration(input.state, input.effectiveProvider);
  if (migration) {
    forceMap.set(key(STRUCTURE_ASPECT, migration.scope), {
      aspect: STRUCTURE_ASPECT,
      scope: migration.scope,
    });
    for (const lang of input.activeLanguages) {
      forceMap.set(key(TRANSLATION_ASPECT, lang), {
        aspect: TRANSLATION_ASPECT,
        scope: lang,
      });
    }
    reasons.push("source-migration");
  }

  // 2. Caller-forced + migration-forced items first so we can short-circuit
  //    duplicate state-driven inclusions later.
  for (const f of forceMap.values()) {
    const k = key(f.aspect, f.scope ?? "");
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ aspect: f.aspect, scope: f.scope ?? "", force: true });
  }

  // 3. Existing state rows that are due.
  for (const row of input.state) {
    const k = key(row.aspect as Aspect, row.scope);
    if (seen.has(k)) continue;
    if (row.nextEligibleAt.getTime() <= input.now.getTime()) {
      seen.add(k);
      items.push({ aspect: row.aspect as Aspect, scope: row.scope });
    }
  }

  // 4. Missing translation rows for active languages — these have no state
  //    row yet, so include them as forced bootstrap items.
  const translationScopes = new Set(
    input.state
      .filter((r) => r.aspect === TRANSLATION_ASPECT)
      .map((r) => r.scope),
  );
  for (const lang of input.activeLanguages) {
    const k = key(TRANSLATION_ASPECT, lang);
    if (seen.has(k)) continue;
    if (!translationScopes.has(lang)) {
      seen.add(k);
      items.push({
        aspect: TRANSLATION_ASPECT,
        scope: lang,
        force: true,
      });
    }
  }

  // 5. Missing logo rows for active languages — same bootstrap as
  //    translations. Without this, a user who adds a new language after a
  //    media was persisted never gets a `(logos, lang)` plan item from the
  //    cadence sweep (it only sees existing state rows), so localized logos
  //    stay un-fetched until the user explicitly visits the media.
  const logosScopes = new Set(
    input.state
      .filter((r) => r.aspect === LOGOS_ASPECT)
      .map((r) => r.scope),
  );
  for (const lang of input.activeLanguages) {
    if (lang.startsWith("en")) continue;
    const k = key(LOGOS_ASPECT, lang);
    if (seen.has(k)) continue;
    if (!logosScopes.has(lang)) {
      seen.add(k);
      items.push({
        aspect: LOGOS_ASPECT,
        scope: lang,
        force: true,
      });
    }
  }

  // `knobs` and `signal` are accepted in the input shape but unused today;
  // referenced here so unused-warnings stay quiet.
  void input.knobs;
  void input.signal;

  return reasons.length > 0
    ? { items, reason: reasons.join(",") }
    : { items };
}

function detectSourceMigration(
  state: MediaAspectState[],
  effective: ProviderName,
): { scope: string } | null {
  const structure = state.find((r) => r.aspect === STRUCTURE_ASPECT);
  if (!structure) return null;
  if (!structure.materializedSource) return null;
  if (structure.materializedSource === effective) return null;
  return { scope: structure.scope };
}

function buildForceMap(
  forceAspects: ForcedAspect[] | undefined,
): Map<string, ForcedAspect> {
  const m = new Map<string, ForcedAspect>();
  if (!forceAspects) return m;
  for (const f of forceAspects) {
    m.set(key(f.aspect, f.scope ?? ""), f);
  }
  return m;
}

function key(aspect: Aspect, scope: string): string {
  return `${aspect}::${scope}`;
}
