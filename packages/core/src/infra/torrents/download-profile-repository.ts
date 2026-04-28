import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  downloadProfile,
  type DownloadProfileAllowedFormat,
} from "@canto/db/schema";
import type { DownloadProfile } from "@canto/core/domain/torrents/rules/download-profile";
import type {
  Quality,
  Source,
} from "@canto/core/domain/torrents/types/common";
import type { ReleaseFlavor } from "@canto/core/domain/torrents/rules/release-groups";

/**
 * Decode a `download_profile` row into the {@link DownloadProfile} domain
 * shape. Throws-narrowing happens at the column level so unknown values
 * coming from older rows don't silently break scoring.
 */
function decodeProfile(row: typeof downloadProfile.$inferSelect): DownloadProfile {
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

export async function findDownloadProfileById(
  db: Database,
  id: string,
): Promise<DownloadProfile | null> {
  const row = await db.query.downloadProfile.findFirst({
    where: eq(downloadProfile.id, id),
  });
  return row ? decodeProfile(row) : null;
}

export async function findDefaultDownloadProfile(
  db: Database,
  flavor: ReleaseFlavor,
): Promise<DownloadProfile | null> {
  const row = await db.query.downloadProfile.findFirst({
    where: and(
      eq(downloadProfile.flavor, flavor),
      eq(downloadProfile.isDefault, true),
    ),
  });
  return row ? decodeProfile(row) : null;
}

export async function findAllDownloadProfiles(
  db: Database,
): Promise<DownloadProfile[]> {
  const rows = await db.query.downloadProfile.findMany({
    orderBy: (p, { asc }) => [asc(p.flavor), asc(p.name)],
  });
  return rows.map(decodeProfile);
}

export async function findDownloadProfilesByFlavor(
  db: Database,
  flavor: ReleaseFlavor,
): Promise<DownloadProfile[]> {
  const rows = await db.query.downloadProfile.findMany({
    where: eq(downloadProfile.flavor, flavor),
    orderBy: (p, { asc }) => [asc(p.name)],
  });
  return rows.map(decodeProfile);
}

/* ── Default profile seed ── */

interface SeedProfile {
  name: string;
  flavor: ReleaseFlavor;
  allowedFormats: DownloadProfileAllowedFormat[];
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
export async function seedDefaultDownloadProfiles(db: Database) {
  const existing = await db.query.downloadProfile.findMany();
  if (existing.length > 0) return existing;

  return db
    .insert(downloadProfile)
    .values(DEFAULT_PROFILES.map((p) => ({ ...p, isDefault: true })))
    .returning();
}

/**
 * Resolve the active download profile for a media using the precedence
 * chain:
 *   1. media.downloadProfileId (snapshot-on-add)
 *   2. folderDownloadProfileId (the folder media routes into)
 *   3. system default profile for media's flavor
 *   4. null — no profile, fall back to the admin scoring rules from
 *              `download_config`
 *
 * The caller decides who supplies `folderDownloadProfileId`. For new
 * downloads coming from `searchTorrents`, that's the result of running
 * the folder router against the media; for already-downloaded media it
 * could be the persisted folder linkage. Either way, this function only
 * cares about the value, not how it was obtained.
 */
export async function findActiveDownloadProfile(
  db: Database,
  args: {
    mediaDownloadProfileId: string | null;
    folderDownloadProfileId: string | null;
    flavor: ReleaseFlavor;
  },
): Promise<DownloadProfile | null> {
  if (args.mediaDownloadProfileId) {
    const profile = await findDownloadProfileById(
      db,
      args.mediaDownloadProfileId,
    );
    if (profile) return profile;
  }
  if (args.folderDownloadProfileId) {
    const profile = await findDownloadProfileById(
      db,
      args.folderDownloadProfileId,
    );
    if (profile) return profile;
  }
  return findDefaultDownloadProfile(db, args.flavor);
}
