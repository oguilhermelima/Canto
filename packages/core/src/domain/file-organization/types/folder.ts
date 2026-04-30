import type { PersistedFolderRules, RoutingRules } from "@canto/db/schema";

/** Branded id for the `download_folder` table. */
export type FolderId = string & { readonly __brand: "FolderId" };

/**
 * A download folder — the canonical "library" the user sees in the admin
 * UI. The legacy `library` repo redirected to this; ids are interchangeable.
 *
 * `rules` is normalized on read to `RoutingRules` (the canonical shape)
 * and never returned in the legacy `RuleGroup` form to callers.
 */
export interface Folder {
  id: FolderId;
  name: string;
  downloadPath: string | null;
  libraryPath: string | null;
  qbitCategory: string | null;
  rules: RoutingRules | null;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
  downloadProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewFolder {
  name: string;
  downloadPath?: string | null;
  libraryPath?: string | null;
  qbitCategory?: string | null;
  rules?: PersistedFolderRules | null;
  priority?: number;
  isDefault?: boolean;
  enabled?: boolean;
  downloadProfileId?: string | null;
}

export interface UpdateFolderInput {
  name?: string;
  downloadPath?: string | null;
  libraryPath?: string | null;
  qbitCategory?: string | null;
  rules?: PersistedFolderRules | null;
  priority?: number;
  isDefault?: boolean;
  enabled?: boolean;
  downloadProfileId?: string | null;
}
