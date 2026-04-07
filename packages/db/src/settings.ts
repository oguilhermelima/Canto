import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "./client";
import { systemSetting } from "./schema";

/* -------------------------------------------------------------------------- */
/*  Encryption (AES-256-GCM)                                                  */
/* -------------------------------------------------------------------------- */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
// TODO: New installations should generate a random per-installation salt stored in the DB.
// Changing this now would break decryption of existing data — requires a re-encryption migration.
const SALT = "canto-settings-v1";

// Key derivation versions — bump when changing iterations/algorithm
const KEY_VERSIONS = {
  1: { iterations: 100_000, digest: "sha256" },
  2: { iterations: 600_000, digest: "sha256" },
} as const;
const CURRENT_KEY_VERSION = 2;
const KEY_VERSION_LENGTH = 1;
// Version prefix byte for new writes — using 0xC1/0xC2 to avoid collision with random IV first bytes
const VERSION_PREFIX: Record<number, number> = { 2: 0xC2 };
const PREFIX_TO_VERSION: Record<number, number> = { 0xC2: 2 };

function getDerivedKey(version: number): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required for settings encryption");
  }
  const config = KEY_VERSIONS[version as keyof typeof KEY_VERSIONS];
  if (!config) throw new Error(`Unknown key version: ${version}`);
  return pbkdf2Sync(secret, SALT, config.iterations, 32, config.digest);
}

const keyCache = new Map<number, Buffer>();
function getKey(version: number = CURRENT_KEY_VERSION): Buffer {
  let key = keyCache.get(version);
  if (!key) {
    key = getDerivedKey(version);
    keyCache.set(version, key);
  }
  return key;
}

function encrypt(plaintext: string): string {
  const key = getKey(CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: [version prefix byte][IV][auth tag][ciphertext]
  const prefix = VERSION_PREFIX[CURRENT_KEY_VERSION];
  if (!prefix) throw new Error(`No prefix defined for key version ${CURRENT_KEY_VERSION}`);
  return Buffer.concat([Buffer.from([prefix]), iv, tag, encrypted]).toString("base64");
}

function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");

  // Detect version: check if first byte is a known version prefix; otherwise assume v1 (legacy, no prefix)
  let version: number;
  let offset: number;
  if (buf[0] !== undefined && buf[0] in PREFIX_TO_VERSION) {
    version = PREFIX_TO_VERSION[buf[0]]!;
    offset = KEY_VERSION_LENGTH;
  } else {
    version = 1;
    offset = 0;
  }

  const key = getKey(version);
  const iv = buf.subarray(offset, offset + IV_LENGTH);
  const tag = buf.subarray(offset + IV_LENGTH, offset + IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(offset + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

/** Keys that store non-sensitive data — stored as plain JSONB. */
const PLAINTEXT_KEYS = new Set([
  "jellyfin.enabled",
  "plex.enabled",
  "qbittorrent.enabled",
  "prowlarr.enabled",
  "jackett.enabled",
  "tmdb.enabled",
  "tvdb.enabled",
  "tvdb.defaultShows",
  "autoMergeVersions",
  "sync.mediaImport.status",
  "cache.spotlight",
  "search.maxIndexers",
  "search.timeout",
  "search.concurrency",
  "sync.folderScan.enabled",
  "onboarding.completed",
  "general.language",
  "paths.rootDataPath",
  "download.importMethod",
  "download.seedRatioLimit",
  "download.seedTimeLimitHours",
  "download.seedCleanupFiles",
]);

function isSensitive(key: string): boolean {
  return !PLAINTEXT_KEYS.has(key);
}

function encryptValue(key: string, value: unknown): unknown {
  if (!isSensitive(key)) return value;
  return encrypt(JSON.stringify(value));
}

function looksEncrypted(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Plaintext JSONB values are booleans, numbers, objects, or short strings — not long base64
  return /^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 20;
}

function decryptValue(key: string, stored: unknown): unknown {
  if (!isSensitive(key)) {
    // Key was recently added to PLAINTEXT_KEYS but DB still has encrypted value from before
    if (looksEncrypted(stored)) {
      try { return JSON.parse(decrypt(stored as string)); } catch { return stored; }
    }
    return stored;
  }
  if (typeof stored !== "string") {
    throw new Error(`Setting "${key}" has invalid encrypted format`);
  }
  return JSON.parse(decrypt(stored));
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Get a setting value from the DB and decrypt if sensitive.
 */
export async function getSetting<T = string>(
  key: string,
): Promise<T | null> {
  const row = await db.query.systemSetting.findFirst({
    where: eq(systemSetting.key, key),
  });

  if (row) {
    return decryptValue(key, row.value) as T;
  }

  return null;
}

/**
 * Upsert a setting value (encrypts sensitive values before storing).
 */
export async function setSetting(
  key: string,
  value: unknown,
): Promise<void> {
  const stored = encryptValue(key, value);
  await db
    .insert(systemSetting)
    .values({ key, value: stored, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value: stored, updatedAt: new Date() },
    });
}

/**
 * Delete a setting.
 */
export async function deleteSetting(key: string): Promise<void> {
  await db.delete(systemSetting).where(eq(systemSetting.key, key));
}

/**
 * Get all settings as a key-value record (decrypted).
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db.query.systemSetting.findMany();
  const result: Record<string, unknown> = {};

  for (const row of rows) {
    result[row.key] = decryptValue(row.key, row.value);
  }

  return result;
}
