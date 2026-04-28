import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  DEFAULT_DOWNLOAD_SCORING_RULES,
  downloadConfig,
  downloadReleaseGroup,
} from "@canto/db";

import type {
  AdminDownloadPolicy,
  Av1Stance,
  ScoringRules,
} from "@canto/core/domain/shared/rules/scoring-rules";
import type {
  ReleaseFlavor,
  ReleaseGroupTier,
} from "@canto/core/domain/torrents/rules/release-groups";

/**
 * Indexable lookup tables built from the `download_release_group` rows.
 * Mirrors the shape the (now-deleted) hardcoded constant used so the
 * pure `classifyReleaseGroup` helper stays an O(1) set membership check.
 *
 * `neutral` is implicit — a group absent from every set falls through to
 * neutral. Only the four scored tiers carry sets.
 */
export type ReleaseGroupTierSets = Record<
  Exclude<ReleaseGroupTier, "neutral">,
  Set<string>
>;

export type ReleaseGroupLookups = Record<ReleaseFlavor, ReleaseGroupTierSets>;

export interface DownloadConfig {
  rules: ScoringRules;
  policy: AdminDownloadPolicy;
}

const av1StanceSchema = z.enum(["neutral", "prefer", "avoid"]);
const stringArraySchema = z.array(z.string());

function emptyLookups(): ReleaseGroupLookups {
  const empty = (): ReleaseGroupTierSets => ({
    tier1: new Set(),
    tier2: new Set(),
    tier3: new Set(),
    avoid: new Set(),
  });
  return { movie: empty(), show: empty(), anime: empty() };
}

const SCORED_TIERS = new Set<Exclude<ReleaseGroupTier, "neutral">>([
  "tier1",
  "tier2",
  "tier3",
  "avoid",
]);
const FLAVORS = new Set<ReleaseFlavor>(["movie", "show", "anime"]);

/**
 * Read the admin download config row. Throws if no row exists — the
 * `seedDownloadDefaults` boot hook is responsible for inserting one, and
 * a missing row at search time is a deployment bug rather than user
 * error. The scoring rules JSONB is structurally validated against the
 * canonical default shape; if validation fails we fall back to the
 * canonical default rather than crashing the search path.
 */
export async function findDownloadConfig(db: Database): Promise<DownloadConfig> {
  const row = await db.query.downloadConfig.findFirst();
  if (!row) {
    throw new Error(
      "download_config row missing — run seedDownloadDefaults before searching",
    );
  }

  const rules = isScoringRulesShape(row.scoringRules)
    ? (row.scoringRules as unknown as ScoringRules)
    : (DEFAULT_DOWNLOAD_SCORING_RULES as unknown as ScoringRules);

  const policy: AdminDownloadPolicy = {
    preferredEditions: stringArraySchema.safeParse(row.preferredEditions).data ?? [],
    avoidedEditions: stringArraySchema.safeParse(row.avoidedEditions).data ?? [],
    av1Stance: av1StanceSchema.safeParse(row.av1Stance).data ?? "neutral",
  };

  return { rules, policy };
}

/**
 * Hydrate the per-flavor, per-tier set maps the scoring engine consumes.
 * One DB roundtrip — the table is tiny (a few hundred rows tops).
 */
export async function findReleaseGroupLookups(
  db: Database,
): Promise<ReleaseGroupLookups> {
  const rows = await db.query.downloadReleaseGroup.findMany();
  const lookups = emptyLookups();
  for (const row of rows) {
    const flavor = row.flavor;
    const tier = row.tier;
    if (!FLAVORS.has(flavor as ReleaseFlavor)) continue;
    if (!SCORED_TIERS.has(tier as Exclude<ReleaseGroupTier, "neutral">))
      continue;
    lookups[flavor as ReleaseFlavor][
      tier as Exclude<ReleaseGroupTier, "neutral">
    ].add(row.nameLower);
  }
  return lookups;
}

/**
 * Persist an admin policy update. Updates the single config row in
 * place; throws if no row exists (the seed at boot is responsible for
 * inserting it). Returns the updated policy so callers don't need to
 * re-read.
 */
export async function upsertAdminDownloadPolicy(
  db: Database,
  policy: AdminDownloadPolicy,
): Promise<AdminDownloadPolicy> {
  const updated = await db
    .update(downloadConfig)
    .set({
      preferredEditions: policy.preferredEditions,
      avoidedEditions: policy.avoidedEditions,
      av1Stance: policy.av1Stance,
      updatedAt: sql`now()`,
    })
    .returning();
  if (updated.length === 0) {
    throw new Error(
      "download_config row missing — run seedDownloadDefaults before persisting admin policy",
    );
  }
  return policy;
}

/** Structural sniff for the scoring rules shape. Cheap — checks the
 *  presence of the top-level keys the engine reads. Full Zod validation
 *  is expensive and unnecessary here: the seed writer is internal. */
function isScoringRulesShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.health) &&
    Array.isArray(v.freshness) &&
    typeof v.quality === "object" &&
    typeof v.source === "object" &&
    typeof v.codec === "object" &&
    typeof v.maxRaw === "number"
  );
}

/** Re-export so call sites can mention the constant by name without
 *  reaching into `@canto/db` directly. */
export { downloadConfig, downloadReleaseGroup };
