import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  Settings Registry                                                         */
/*                                                                            */
/*  Single source of truth for every admin-configurable setting: its key,    */
/*  Zod schema, default, UI metadata, encryption flag, and env-var override. */
/*                                                                            */
/*  Why the `def()` helper exists                                             */
/*  ────────────────────────────────                                          */
/*  Without a generic wrapper, TypeScript widens each registry entry to      */
/*  `SettingDef<ZodTypeAny>` inside the const literal, and `z.infer` collapses*/
/*  to `any`. The generic `def<T>` preserves the narrow schema type (ZodString*/
/*  ZodNumber, etc.), which is what lets `SettingValue<K>` produce correct   */
/*  types downstream. Do not remove the wrapper.                              */
/*                                                                            */
/*  Dynamic key prefixes (e.g. `sync.mediaImport.status.<tag>`) are NOT       */
/*  managed here — callers that need dynamic keys use the raw escape hatch   */
/*  in `@canto/db/settings` (`getSettingRaw` / `setSettingRaw`).             */
/* -------------------------------------------------------------------------- */

export type SettingInputType =
  | "text"
  | "password"
  | "url"
  | "number"
  | "boolean"
  | "select";

export interface SettingSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SettingDef<T extends z.ZodTypeAny> {
  /** Dot-separated UI group path, e.g. "mediaServers.plex". */
  readonly group: string;
  /** Label shown in admin UI. */
  readonly label: string;
  /** Optional help text rendered near the field. */
  readonly help?: string;
  /** Zod schema used for both read-time and write-time validation. */
  readonly schema: T;
  /** Returned when the row is missing. Must satisfy `schema` when set. */
  readonly default?: z.infer<T>;
  /** Stored encrypted when true. See `@canto/db/settings` for the pipeline. */
  readonly secret: boolean;
  /** Input type for auto-generated admin forms. */
  readonly inputType: SettingInputType;
  /** Static options for `inputType: "select"`. Dynamic selects (e.g. language)
   *  render via UI-side escape hatch and leave this empty. */
  readonly options?: readonly SettingSelectOption[];
  /** Environment variable name checked before the DB. String/number only —
   *  boolean env vars are a footgun (JS truthiness treats "false" as true). */
  readonly envVar?: string;
  /** Deprecation notice; read/write still works but UI shows a warning. */
  readonly deprecated?: string;
  /** State-like keys (auto-populated, cache blobs) — skipped by admin UI. */
  readonly hidden?: boolean;
}

/**
 * Generic helper that preserves the narrow schema type for each registry entry.
 * Also enforces a hard constraint: `envVar` is incompatible with boolean keys
 * because env var strings like "false" coerce to `true` under JS truthiness.
 */
export function def<T extends z.ZodTypeAny>(d: SettingDef<T>): SettingDef<T> {
  if (d.envVar && d.inputType === "boolean") {
    throw new Error(
      `[settings-registry] "${d.label}": envVar override is not supported for boolean keys`,
    );
  }
  return d;
}

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

export const SETTINGS_REGISTRY = {
  // ── Media servers: Jellyfin ──────────────────────────────────────────────
  "jellyfin.enabled": def({
    group: "mediaServers.jellyfin",
    label: "Enable Jellyfin",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "jellyfin.url": def({
    group: "mediaServers.jellyfin",
    label: "Jellyfin URL",
    help: "Base URL of the Jellyfin server (e.g. http://192.168.0.10:8096)",
    schema: z.string().url(),
    secret: false,
    inputType: "url",
  }),
  "jellyfin.apiKey": def({
    group: "mediaServers.jellyfin",
    label: "Jellyfin API Key",
    help: "Admin API key used for server-level operations",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),

  // ── Media servers: Plex ──────────────────────────────────────────────────
  "plex.enabled": def({
    group: "mediaServers.plex",
    label: "Enable Plex",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "plex.url": def({
    group: "mediaServers.plex",
    label: "Plex URL",
    help: "Base URL of the Plex server (e.g. http://192.168.0.10:32400)",
    schema: z.string().url(),
    secret: false,
    inputType: "url",
  }),
  "plex.token": def({
    group: "mediaServers.plex",
    label: "Plex Admin Token",
    help: "Admin token used for server-level operations like library scans",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),
  "plex.clientId": def({
    group: "mediaServers.plex",
    label: "Plex Client ID",
    help: "Auto-generated client identifier; rarely edited by hand",
    schema: z.string().min(1),
    secret: false,
    inputType: "text",
    hidden: true,
  }),
  "plex.machineId": def({
    group: "mediaServers.plex",
    label: "Plex Machine Identifier",
    help: "40-char hex ID of the Plex server; discovered automatically",
    schema: z.string().min(1),
    secret: false,
    inputType: "text",
    hidden: true,
  }),

  // ── Services: Trakt ───────────────────────────────────────────────────────
  "trakt.clientId": def({
    group: "services.trakt",
    label: "Trakt Client ID",
    help: "OAuth application client id from trakt.tv/oauth/applications",
    schema: z.string().min(1),
    secret: false,
    inputType: "text",
    envVar: "TRAKT_CLIENT_ID",
  }),
  "trakt.clientSecret": def({
    group: "services.trakt",
    label: "Trakt Client Secret",
    help: "OAuth application client secret used for device token exchange",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
    envVar: "TRAKT_CLIENT_SECRET",
  }),

  // ── Downloads: qBittorrent ───────────────────────────────────────────────
  "qbittorrent.enabled": def({
    group: "downloads.qbittorrent",
    label: "Enable qBittorrent",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "qbittorrent.url": def({
    group: "downloads.qbittorrent",
    label: "qBittorrent URL",
    help: "Base URL of the qBittorrent WebUI (e.g. http://192.168.0.10:8080)",
    schema: z.string().url(),
    secret: false,
    inputType: "url",
  }),
  "qbittorrent.username": def({
    group: "downloads.qbittorrent",
    label: "qBittorrent Username",
    schema: z.string().min(1),
    secret: false,
    inputType: "text",
  }),
  "qbittorrent.password": def({
    group: "downloads.qbittorrent",
    label: "qBittorrent Password",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),

  // ── Indexers: Prowlarr ───────────────────────────────────────────────────
  "prowlarr.enabled": def({
    group: "indexers.prowlarr",
    label: "Enable Prowlarr",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "prowlarr.url": def({
    group: "indexers.prowlarr",
    label: "Prowlarr URL",
    schema: z.string().url(),
    secret: false,
    inputType: "url",
  }),
  "prowlarr.apiKey": def({
    group: "indexers.prowlarr",
    label: "Prowlarr API Key",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),

  // ── Indexers: Jackett ────────────────────────────────────────────────────
  "jackett.enabled": def({
    group: "indexers.jackett",
    label: "Enable Jackett",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "jackett.url": def({
    group: "indexers.jackett",
    label: "Jackett URL",
    schema: z.string().url(),
    secret: false,
    inputType: "url",
  }),
  "jackett.apiKey": def({
    group: "indexers.jackett",
    label: "Jackett API Key",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),

  // ── Search tuning ────────────────────────────────────────────────────────
  "search.maxIndexers": def({
    group: "indexers.search",
    label: "Max Indexers per Search",
    help: "Upper bound on the number of indexers queried per release search",
    schema: z.coerce.number().int().min(1).max(50),
    default: 5,
    secret: false,
    inputType: "number",
  }),
  "search.timeout": def({
    group: "indexers.search",
    label: "Search Timeout (ms)",
    help: "Hard deadline for each indexer query",
    schema: z.coerce.number().int().min(1000).max(120_000),
    default: 30_000,
    secret: false,
    inputType: "number",
  }),
  "search.concurrency": def({
    group: "indexers.search",
    label: "Search Concurrency",
    help: "Number of indexer queries executed in parallel",
    schema: z.coerce.number().int().min(1).max(20),
    default: 3,
    secret: false,
    inputType: "number",
  }),

  // ── Metadata: TMDB ───────────────────────────────────────────────────────
  "tmdb.enabled": def({
    group: "metadata.tmdb",
    label: "Enable TMDB",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "tmdb.apiKey": def({
    group: "metadata.tmdb",
    label: "TMDB API Key",
    help: "Used for movie/show metadata, trending, recommendations",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),

  // ── Metadata: TVDB ───────────────────────────────────────────────────────
  "tvdb.enabled": def({
    group: "metadata.tvdb",
    label: "Enable TVDB",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "tvdb.apiKey": def({
    group: "metadata.tvdb",
    label: "TVDB API Key",
    help: "Used for episode-level metadata and TVDB-preferred shows",
    schema: z.string().min(1),
    secret: true,
    inputType: "password",
  }),
  "tvdb.defaultShows": def({
    group: "metadata.tvdb",
    label: "Default new shows to TVDB",
    help: "When on, newly added shows prefer TVDB episode data over TMDB",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),
  "tvdb.token": def({
    group: "metadata.tvdb",
    label: "TVDB Auth Token (cached)",
    schema: z.string(),
    secret: true,
    inputType: "password",
    hidden: true,
  }),
  "tvdb.tokenExpires": def({
    group: "metadata.tvdb",
    label: "TVDB Token Expiry",
    schema: z.coerce.number().int(),
    secret: false,
    inputType: "number",
    hidden: true,
  }),

  // ── Sync ─────────────────────────────────────────────────────────────────
  "sync.folderScan.enabled": def({
    group: "sync",
    label: "Enable Folder Scan",
    help: "When on, the worker periodically scans on-disk library folders",
    schema: z.boolean(),
    default: true,
    secret: false,
    inputType: "boolean",
  }),

  // ── Downloads: library paths and seeding ─────────────────────────────────
  "download.importMethod": def({
    group: "downloads.library",
    label: "Import Method",
    help: "local = hardlink into the library (needs filesystem access); remote = qBit API",
    schema: z.enum(["local", "remote"]),
    default: "local",
    secret: false,
    inputType: "select",
    options: [
      { value: "local", label: "Local (hardlink)" },
      { value: "remote", label: "Remote (qBittorrent API)" },
    ],
  }),
  "download.seedRatioLimit": def({
    group: "downloads.library",
    label: "Seed Ratio Limit",
    help: "Stop seeding when this ratio is reached",
    schema: z.coerce.number().min(0).max(100),
    default: 2,
    secret: false,
    inputType: "number",
  }),
  "download.seedTimeLimitHours": def({
    group: "downloads.library",
    label: "Seed Time Limit (hours)",
    help: "Stop seeding after this many hours (0 disables the limit)",
    schema: z.coerce.number().int().min(0),
    default: 336,
    secret: false,
    inputType: "number",
  }),
  "download.seedCleanupFiles": def({
    group: "downloads.library",
    label: "Delete files on seed completion",
    help: "Remove torrent files once seeding finishes",
    schema: z.boolean(),
    default: true,
    secret: false,
    inputType: "boolean",
  }),
  "autoMergeVersions": def({
    group: "downloads.library",
    label: "Auto-merge quality variants",
    help: "Merge multiple quality variants of the same movie into one Jellyfin entry",
    schema: z.boolean(),
    default: true,
    secret: false,
    inputType: "boolean",
  }),

  // ── General ──────────────────────────────────────────────────────────────
  "general.language": def({
    group: "general",
    label: "Interface Language",
    help: "Default language for titles, overviews, and UI copy. Options are resolved from the supportedLanguage table at render time.",
    schema: z.string().min(2),
    default: "en-US",
    secret: false,
    inputType: "select",
  }),

  // ── System: Redis ────────────────────────────────────────────────────────
  "redis.host": def({
    group: "system.redis",
    label: "Redis Host",
    schema: z.string().min(1),
    default: "localhost",
    secret: false,
    inputType: "text",
    envVar: "REDIS_HOST",
  }),
  "redis.port": def({
    group: "system.redis",
    label: "Redis Port",
    schema: z.coerce.number().int().min(1).max(65535),
    default: 6379,
    secret: false,
    inputType: "number",
    envVar: "REDIS_PORT",
  }),

  // ── System: Onboarding ───────────────────────────────────────────────────
  "onboarding.completed": def({
    group: "system.onboarding",
    label: "Onboarding Completed",
    help: "Flipped true after the admin finishes initial setup",
    schema: z.boolean(),
    default: false,
    secret: false,
    inputType: "boolean",
  }),

  // ── System: Cache (state, not config) ────────────────────────────────────
  "cache.spotlight": def({
    group: "system.cache",
    label: "Spotlight Cache",
    help: "Cached TMDB trending payload used as spotlight fallback",
    schema: z.object({
      data: z.array(z.unknown()),
      updatedAt: z.string(),
    }),
    secret: false,
    inputType: "text",
    hidden: true,
  }),
} as const;

/* -------------------------------------------------------------------------- */
/*  Derived types                                                             */
/* -------------------------------------------------------------------------- */

export type SettingKey = keyof typeof SETTINGS_REGISTRY;

export type SettingValue<K extends SettingKey> = z.infer<
  (typeof SETTINGS_REGISTRY)[K]["schema"]
>;

/** Runtime type guard for string → SettingKey narrowing. */
export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key);
}

/** Enumerate all registered keys in declaration order. */
export function allSettingKeys(): SettingKey[] {
  return Object.keys(SETTINGS_REGISTRY) as SettingKey[];
}

/** Enumerate only the keys visible in the admin UI (skips `hidden: true`). */
export function visibleSettingKeys(): SettingKey[] {
  return allSettingKeys().filter((k) => !SETTINGS_REGISTRY[k].hidden);
}
