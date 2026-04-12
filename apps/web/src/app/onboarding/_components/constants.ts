export type Step =
  | "welcome"
  | "overview"
  | "tmdb"
  | "tvdb"
  | "download-client"
  | "libraries-intro"
  | "libraries-transfer"
  | "libraries-configure"
  | "indexer"
  | "jellyfin"
  | "plex"
  | "syncing"
  | "ready";

export type Settings = Record<string, unknown>;

export const str = (s: Settings | undefined, key: string): string =>
  (s?.[key] as string | undefined) ?? "";

export const bool = (s: Settings | undefined, key: string): boolean =>
  (s?.[key] as boolean | undefined) ?? false;

/** Shared primary button className */
export const btnCn = "rounded-xl min-w-[200px]";

/** Steps that belong to the libraries group — skip jumps past all of them */
export const LIBRARY_STEPS: Step[] = [
  "libraries-intro",
  "libraries-transfer",
  "libraries-configure",
];
