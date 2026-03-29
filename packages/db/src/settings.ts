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
const SALT = "canto-settings-v1";

function getDerivedKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required for settings encryption");
  }
  return pbkdf2Sync(secret, SALT, 100_000, 32, "sha256");
}

let derivedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!derivedKey) derivedKey = getDerivedKey();
  return derivedKey;
}

function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/** Keys that store non-sensitive data — stored as plain JSONB. */
const PLAINTEXT_KEYS = new Set([
  "jellyfin.enabled",
  "plex.enabled",
  "qbittorrent.enabled",
  "prowlarr.enabled",
  "jackett.enabled",
  "tmdb.enabled",
  "autoMergeVersions",
]);

function isSensitive(key: string): boolean {
  return !PLAINTEXT_KEYS.has(key);
}

function encryptValue(key: string, value: unknown): unknown {
  if (!isSensitive(key)) return value;
  return encrypt(JSON.stringify(value));
}

function decryptValue(key: string, stored: unknown): unknown {
  if (!isSensitive(key)) return stored;
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
