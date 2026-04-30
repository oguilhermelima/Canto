import type {
  Folder,
  FolderId,
  NewFolder,
  UpdateFolderInput,
} from "@canto/core/domain/file-organization/types/folder";
import { normalizeFolderRules } from "@canto/core/domain/torrents/rules/folder-routing";
import type { downloadFolder, PersistedFolderRules, RoutingRules } from "@canto/db/schema";

type Row = typeof downloadFolder.$inferSelect;
type Insert = typeof downloadFolder.$inferInsert;

export type FolderRowWithNormalizedRules = Omit<Row, "rules"> & {
  rules: RoutingRules | null;
};

/** Converts the on-disk persisted-rules union to the canonical RoutingRules shape. */
export function normalizeRow(row: Row): FolderRowWithNormalizedRules {
  return { ...row, rules: normalizeFolderRules(row.rules) };
}

export function toDomain(row: Row): Folder {
  const normalized = normalizeRow(row);
  return {
    id: normalized.id as FolderId,
    name: normalized.name,
    downloadPath: normalized.downloadPath,
    libraryPath: normalized.libraryPath,
    qbitCategory: normalized.qbitCategory,
    rules: normalized.rules,
    priority: normalized.priority,
    isDefault: normalized.isDefault,
    enabled: normalized.enabled,
    downloadProfileId: normalized.downloadProfileId,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

export function toRow(input: NewFolder): Insert {
  return {
    name: input.name,
    downloadPath: input.downloadPath ?? null,
    libraryPath: input.libraryPath ?? null,
    qbitCategory: input.qbitCategory ?? null,
    rules: (input.rules ?? null),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
    ...(input.enabled !== undefined && { enabled: input.enabled }),
    downloadProfileId: input.downloadProfileId ?? null,
  };
}

export function toUpdateRow(input: UpdateFolderInput): Partial<Insert> {
  const out: Partial<Insert> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.downloadPath !== undefined) out.downloadPath = input.downloadPath;
  if (input.libraryPath !== undefined) out.libraryPath = input.libraryPath;
  if (input.qbitCategory !== undefined) out.qbitCategory = input.qbitCategory;
  if (input.rules !== undefined) out.rules = input.rules;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.isDefault !== undefined) out.isDefault = input.isDefault;
  if (input.enabled !== undefined) out.enabled = input.enabled;
  if (input.downloadProfileId !== undefined) out.downloadProfileId = input.downloadProfileId;
  return out;
}
