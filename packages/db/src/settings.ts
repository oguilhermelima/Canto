import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  allSettingKeys,
  isSettingKey,
  SETTINGS_REGISTRY,
  type SettingKey,
  type SettingValue,
} from "./settings-registry";

// Re-export the registry surface so consumers can treat `@canto/db/settings`
// as the single entry point for everything settings-related. This keeps the
// registry file path internal to @canto/db and frees @canto/core from any
// dependency on the persistence layer (no workspace cycle).
export {
  SETTINGS_REGISTRY,
  allSettingKeys,
  visibleSettingKeys,
  isSettingKey,
  type SettingKey,
  type SettingValue,
  type SettingDef,
  type SettingInputType,
  type SettingSelectOption,
} from "./settings-registry";

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
const VERSION_PREFIX: Record<number, number> = { 2: 0xc2 };
const PREFIX_TO_VERSION: Record<number, number> = { 0xc2: 2 };

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

function looksEncrypted(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Plaintext JSONB values are booleans, numbers, objects, or short strings — not long base64
  return /^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 20;
}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

export class SettingValidationError extends Error {
  constructor(
    public readonly key: string,
    public readonly zodError: z.ZodError,
  ) {
    super(`Setting "${key}" failed validation: ${zodError.message}`);
    this.name = "SettingValidationError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Cache (30s TTL, invalidated on every write/delete)                        */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS = 30_000;
interface CacheEntry {
  value: unknown;
  expires: number;
}
const valueCache = new Map<string, CacheEntry>();

// Dedicated cache for the global `general.language` lookup. The browse
// endpoint hits it on every public page load, so we keep a separate slot with
// a longer TTL and an explicit invalidator that fires when `general.language`
// is written.
const DEFAULT_LANGUAGE_TTL_MS = 60_000;
let defaultLanguageCache: { value: string; expires: number } | null = null;

function getCached(key: string): { hit: true; value: unknown } | { hit: false } {
  const entry = valueCache.get(key);
  if (!entry) return { hit: false };
  if (entry.expires < Date.now()) {
    valueCache.delete(key);
    return { hit: false };
  }
  return { hit: true, value: entry.value };
}

function setCached(key: string, value: unknown): void {
  valueCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function invalidateCache(key: string): void {
  valueCache.delete(key);
}

export function clearSettingsCache(): void {
  valueCache.clear();
  defaultLanguageCache = null;
}

/** Bust the default-language cache (call after `general.language` changes). */
export function invalidateDefaultLanguage(): void {
  defaultLanguageCache = null;
}

/* -------------------------------------------------------------------------- */
/*  Decode / encode                                                           */
/* -------------------------------------------------------------------------- */

function decodeStoredValue<K extends SettingKey>(
  key: K,
  raw: unknown,
): SettingValue<K> | null {
  const def = SETTINGS_REGISTRY[key];
  let payload: unknown;

  if (def.secret) {
    if (typeof raw !== "string") {
      console.error(
        `[settings] ${key}: expected encrypted string but got ${typeof raw} — re-enter via admin UI`,
      );
      return null;
    }
    try {
      payload = JSON.parse(decrypt(raw));
    } catch {
      console.error(
        `[settings] ${key}: decryption failed — re-enter via admin UI`,
      );
      return null;
    }
  } else if (looksEncrypted(raw)) {
    // Legacy fallback: key was previously encrypted but is now plaintext in the registry.
    // Try to decrypt; if that fails, assume it's already plaintext and fall through.
    try {
      payload = JSON.parse(decrypt(raw as string));
    } catch {
      payload = raw;
    }
  } else {
    payload = raw;
  }

  const parsed = def.schema.safeParse(payload);
  if (!parsed.success) {
    if (def.secret) {
      console.error(`[settings] ${key}: stored value failed schema validation`);
    } else {
      console.error(
        `[settings] ${key}: stored value failed schema validation`,
        parsed.error.issues,
      );
    }
    return null;
  }
  return parsed.data as SettingValue<K>;
}

function encodeWriteValue<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): unknown {
  const def = SETTINGS_REGISTRY[key];
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) {
    throw new SettingValidationError(key, parsed.error);
  }
  if (def.secret) {
    return encrypt(JSON.stringify(parsed.data));
  }
  return parsed.data;
}

/* -------------------------------------------------------------------------- */
/*  Env var override (string/number keys only — boolean envs are a footgun)  */
/* -------------------------------------------------------------------------- */

function readEnvOverride<K extends SettingKey>(
  key: K,
): SettingValue<K> | undefined {
  const def = SETTINGS_REGISTRY[key];
  if (!def.envVar) return undefined;
  const raw = process.env[def.envVar];
  if (raw === undefined) return undefined;
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[settings] env var ${def.envVar} for ${key} failed schema validation; falling through to DB`,
    );
    return undefined;
  }
  return parsed.data as SettingValue<K>;
}

/* -------------------------------------------------------------------------- */
/*  Connection-error retry                                                    */
/* -------------------------------------------------------------------------- */

// postgres.js reopens dropped connections transparently on the next call, but
// the in-flight query that raced the drop still rejects. Settings are hit on
// the hot path of every worker job (getTvdbProvider, getTmdbProvider), so a
// single stale socket there triggers a queue-wide failure storm. One retry is
// enough to land on a freshly opened socket.
const CONNECTION_ERROR_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
]);

function isConnectionError(err: unknown): boolean {
  const cause = (err as { cause?: unknown })?.cause;
  const code = (cause as { code?: unknown })?.code;
  return typeof code === "string" && CONNECTION_ERROR_CODES.has(code);
}

async function withConnectionRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    return fn();
  }
}

/* -------------------------------------------------------------------------- */
/*  Typed single-key API                                                      */
/* -------------------------------------------------------------------------- */

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingValue<K> | null> {
  const envValue = readEnvOverride(key);
  if (envValue !== undefined) return envValue;

  const cached = getCached(key);
  if (cached.hit) return cached.value as SettingValue<K> | null;

  const row = await withConnectionRetry(() =>
    db.query.systemSetting.findFirst({
      where: eq(systemSetting.key, key),
    }),
  );

  const decoded = row ? decodeStoredValue(key, row.value) : null;
  setCached(key, decoded);
  return decoded;
}

export async function getSettingOrThrow<K extends SettingKey>(
  key: K,
): Promise<SettingValue<K>> {
  const value = await getSetting(key);
  if (value === null) {
    throw new Error(`Setting "${key}" is not configured`);
  }
  return value;
}

/**
 * Resolve the global `general.language` setting with a dedicated 60s TTL
 * in-process cache. The `browse` discovery endpoint reads this on every public
 * page load, so we keep a separate cache slot from the regular `getSetting`
 * cache to avoid cross-key churn. Returns `"en-US"` when the setting is unset.
 */
export async function getDefaultLanguage(): Promise<string> {
  const now = Date.now();
  if (defaultLanguageCache && defaultLanguageCache.expires > now) {
    return defaultLanguageCache.value;
  }
  const stored = await getSetting("general.language");
  const value = stored ?? "en-US";
  defaultLanguageCache = { value, expires: now + DEFAULT_LANGUAGE_TTL_MS };
  return value;
}

export async function getSettings<K extends SettingKey>(
  keys: readonly K[],
): Promise<{ [P in K]: SettingValue<P> | null }> {
  const result: Record<string, unknown> = {};
  const misses: K[] = [];

  for (const key of keys) {
    const cached = getCached(key);
    if (cached.hit) {
      result[key] = cached.value;
    } else {
      misses.push(key);
    }
  }

  if (misses.length > 0) {
    const rows = await withConnectionRetry(() =>
      db
        .select()
        .from(systemSetting)
        .where(inArray(systemSetting.key, misses as unknown as string[])),
    );
    const byKey = new Map(rows.map((r) => [r.key, r.value] as const));
    for (const key of misses) {
      const raw = byKey.get(key);
      const decoded = raw === undefined ? null : decodeStoredValue(key, raw);
      setCached(key, decoded);
      result[key] = decoded;
    }
  }

  return result as { [P in K]: SettingValue<P> | null };
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  const stored = encodeWriteValue(key, value);
  await db
    .insert(systemSetting)
    .values({ key, value: stored, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value: stored, updatedAt: new Date() },
    });
  invalidateCache(key);
  if (key === "general.language") invalidateDefaultLanguage();
}

/**
 * Atomic batch write. All entries are validated + encoded first, then written
 * inside a single transaction. Either every value lands or none do — no more
 * half-applied config (e.g. qbittorrent.enabled=true without a password).
 *
 * Accepts both typed and dynamic keys; typed keys go through Zod + encryption,
 * dynamic keys fall through like `setSettingRaw`.
 */
export async function setManySettings(
  entries: readonly { key: string; value?: unknown }[],
): Promise<void> {
  // Phase 1: validate + encode every entry before touching the DB so a bad
  // value rejects the whole batch up front.
  const encoded = entries.map(({ key, value }) => {
    if (isSettingKey(key)) {
      return {
        key,
        stored: encodeWriteValue(key, value as SettingValue<SettingKey>),
        typed: true,
      };
    }
    return { key, stored: value, typed: false };
  });

  // Phase 2: single transaction — all writes commit together or roll back.
  await db.transaction(async (tx) => {
    for (const { key, stored } of encoded) {
      await tx
        .insert(systemSetting)
        .values({ key, value: stored, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSetting.key,
          set: { value: stored, updatedAt: new Date() },
        });
    }
  });

  // Phase 3: invalidate cache for keys we actually cache (typed only).
  for (const { key, typed } of encoded) {
    if (typed) invalidateCache(key);
    if (key === "general.language") invalidateDefaultLanguage();
  }
}

export async function deleteSetting<K extends SettingKey>(key: K): Promise<void> {
  await db.delete(systemSetting).where(eq(systemSetting.key, key));
  invalidateCache(key);
  if (key === "general.language") invalidateDefaultLanguage();
}

/* -------------------------------------------------------------------------- */
/*  Snapshot / listing                                                        */
/* -------------------------------------------------------------------------- */

export interface SettingSnapshot {
  key: SettingKey;
  value: unknown;
  hasValue: boolean;
  secret: boolean;
  def: (typeof SETTINGS_REGISTRY)[SettingKey];
}

export async function listAllSettings(): Promise<SettingSnapshot[]> {
  const snapshots: SettingSnapshot[] = [];
  for (const key of allSettingKeys()) {
    const def = SETTINGS_REGISTRY[key];
    if (def.hidden) continue;
    const value = await getSetting(key);
    snapshots.push({
      key,
      value: def.secret ? null : value,
      hasValue: value !== null,
      secret: def.secret,
      def: def as (typeof SETTINGS_REGISTRY)[SettingKey],
    });
  }
  return snapshots;
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of allSettingKeys()) {
    result[key] = await getSetting(key);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Raw escape hatch — dynamic keys, bypasses registry + cache + encryption  */
/* -------------------------------------------------------------------------- */

export async function getSettingRaw(key: string): Promise<unknown | null> {
  const row = await db.query.systemSetting.findFirst({
    where: eq(systemSetting.key, key),
  });
  return row ? row.value : null;
}

export async function setSettingRaw(key: string, value: unknown): Promise<void> {
  await db
    .insert(systemSetting)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function deleteSettingRaw(key: string): Promise<void> {
  await db.delete(systemSetting).where(eq(systemSetting.key, key));
}
