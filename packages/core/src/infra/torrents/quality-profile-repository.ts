import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  qualityProfile,
  type QualityProfileAllowedFormat,
} from "@canto/db/schema";
import type { QualityProfile } from "@canto/core/domain/torrents/rules/quality-profile";
import type {
  Quality,
  Source,
} from "@canto/core/domain/torrents/types/common";
import type { ReleaseFlavor } from "@canto/core/domain/torrents/rules/release-groups";

/**
 * Decode a `quality_profile` row into the {@link QualityProfile} domain
 * shape. Throws-narrowing happens at the column level so unknown values
 * coming from older rows don't silently break scoring.
 */
function decodeProfile(row: typeof qualityProfile.$inferSelect): QualityProfile {
  return {
    id: row.id,
    name: row.name,
    flavor: row.flavor as ReleaseFlavor,
    allowedFormats: row.allowedFormats.map((f) => ({
      quality: f.quality as Quality,
      source: f.source as Source,
      weight: f.weight,
    })),
    cutoffQuality: (row.cutoffQuality as Quality | null) ?? null,
    cutoffSource: (row.cutoffSource as Source | null) ?? null,
    minTotalScore: row.minTotalScore,
    isDefault: row.isDefault,
  };
}

export async function findQualityProfileById(
  db: Database,
  id: string,
): Promise<QualityProfile | null> {
  const row = await db.query.qualityProfile.findFirst({
    where: eq(qualityProfile.id, id),
  });
  return row ? decodeProfile(row) : null;
}

export async function findDefaultQualityProfile(
  db: Database,
  flavor: ReleaseFlavor,
): Promise<QualityProfile | null> {
  const row = await db.query.qualityProfile.findFirst({
    where: and(
      eq(qualityProfile.flavor, flavor),
      eq(qualityProfile.isDefault, true),
    ),
  });
  return row ? decodeProfile(row) : null;
}

export async function findAllQualityProfiles(
  db: Database,
): Promise<QualityProfile[]> {
  const rows = await db.query.qualityProfile.findMany({
    orderBy: (p, { asc }) => [asc(p.flavor), asc(p.name)],
  });
  return rows.map(decodeProfile);
}

export async function findQualityProfilesByFlavor(
  db: Database,
  flavor: ReleaseFlavor,
): Promise<QualityProfile[]> {
  const rows = await db.query.qualityProfile.findMany({
    where: eq(qualityProfile.flavor, flavor),
    orderBy: (p, { asc }) => [asc(p.name)],
  });
  return rows.map(decodeProfile);
}

/* ── Default profile seed ── */

interface SeedProfile {
  name: string;
  flavor: ReleaseFlavor;
  allowedFormats: QualityProfileAllowedFormat[];
  cutoffQuality: string | null;
  cutoffSource: string | null;
  minTotalScore: number;
}

const DEFAULT_PROFILES: SeedProfile[] = [
  {
    name: "1080p Preferred",
    flavor: "movie",
    allowedFormats: [
      { quality: "uhd", source: "remux", weight: 35 },
      { quality: "uhd", source: "bluray", weight: 32 },
      { quality: "fullhd", source: "remux", weight: 45 },
      { quality: "fullhd", source: "bluray", weight: 42 },
      { quality: "fullhd", source: "webdl", weight: 38 },
      { quality: "fullhd", source: "webrip", weight: 30 },
      { quality: "hd", source: "bluray", weight: 22 },
    ],
    cutoffQuality: "fullhd",
    cutoffSource: "bluray",
    minTotalScore: 0,
  },
  {
    name: "1080p Preferred",
    flavor: "show",
    allowedFormats: [
      { quality: "uhd", source: "webdl", weight: 35 },
      { quality: "fullhd", source: "webdl", weight: 45 },
      { quality: "fullhd", source: "bluray", weight: 40 },
      { quality: "fullhd", source: "webrip", weight: 35 },
      { quality: "hd", source: "webdl", weight: 22 },
    ],
    cutoffQuality: "fullhd",
    cutoffSource: "webdl",
    minTotalScore: 0,
  },
  {
    name: "Anime BluRay Preferred",
    flavor: "anime",
    allowedFormats: [
      { quality: "fullhd", source: "bluray", weight: 45 },
      { quality: "fullhd", source: "webdl", weight: 42 },
      { quality: "fullhd", source: "webrip", weight: 36 },
      { quality: "hd", source: "webdl", weight: 24 },
    ],
    cutoffQuality: "fullhd",
    cutoffSource: "bluray",
    minTotalScore: 0,
  },
];

/**
 * Idempotent seeder. Inserts the curated default profiles (one per
 * flavor, marked default) on first install. Skips if any profile rows
 * already exist — re-running won't overwrite a customised setup.
 */
export async function seedDefaultQualityProfiles(db: Database) {
  const existing = await db.query.qualityProfile.findMany();
  if (existing.length > 0) return existing;

  return db
    .insert(qualityProfile)
    .values(DEFAULT_PROFILES.map((p) => ({ ...p, isDefault: true })))
    .returning();
}

/**
 * Resolve the active quality profile for a media using the precedence
 * chain:
 *   1. media.qualityProfileId (snapshot-on-add)
 *   2. folderQualityProfileId (the folder media routes into)
 *   3. system default profile for media's flavor
 *   4. null — no profile, fall back to the admin scoring rules from
 *              `download_config`
 *
 * The caller decides who supplies `folderQualityProfileId`. For new
 * downloads coming from `searchTorrents`, that's the result of running
 * the folder router against the media; for already-downloaded media it
 * could be the persisted folder linkage. Either way, this function only
 * cares about the value, not how it was obtained.
 */
export async function findActiveQualityProfile(
  db: Database,
  args: {
    mediaQualityProfileId: string | null;
    folderQualityProfileId: string | null;
    flavor: ReleaseFlavor;
  },
): Promise<QualityProfile | null> {
  if (args.mediaQualityProfileId) {
    const profile = await findQualityProfileById(
      db,
      args.mediaQualityProfileId,
    );
    if (profile) return profile;
  }
  if (args.folderQualityProfileId) {
    const profile = await findQualityProfileById(
      db,
      args.folderQualityProfileId,
    );
    if (profile) return profile;
  }
  return findDefaultQualityProfile(db, args.flavor);
}
