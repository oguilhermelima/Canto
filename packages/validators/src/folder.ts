import { z } from "zod";

// ── Rule schema (recursive AND/OR conditions) ──

const ruleCondition = z.discriminatedUnion("field", [
  z.object({ field: z.literal("type"), op: z.literal("eq"), value: z.enum(["movie", "show"]) }),
  z.object({ field: z.literal("genre"), op: z.enum(["contains_any", "contains_all"]), value: z.array(z.string()) }),
  z.object({ field: z.literal("genreId"), op: z.enum(["contains_any", "contains_all"]), value: z.array(z.number()) }),
  z.object({ field: z.literal("originCountry"), op: z.enum(["contains_any", "not_contains_any"]), value: z.array(z.string()) }),
  z.object({ field: z.literal("originalLanguage"), op: z.enum(["eq", "neq"]), value: z.string() }),
  z.object({ field: z.literal("contentRating"), op: z.enum(["eq", "in"]), value: z.union([z.string(), z.array(z.string())]) }),
  z.object({ field: z.literal("provider"), op: z.literal("eq"), value: z.enum(["tmdb", "tvdb"]) }),
]);

export type RuleGroupInput = {
  operator: "AND" | "OR";
  conditions: Array<z.infer<typeof ruleCondition> | RuleGroupInput>;
};

const ruleGroup: z.ZodType<RuleGroupInput> = z.object({
  operator: z.enum(["AND", "OR"]),
  conditions: z.array(z.lazy(() => z.union([ruleCondition, ruleGroup]))),
});

export { ruleGroup, ruleCondition };

// ── Folder CRUD inputs ──

export const createFolderInput = z.object({
  name: z.string().min(1).max(100),
  downloadPath: z.string().min(1).optional(),
  libraryPath: z.string().min(1).optional(),
  qbitCategory: z.string().min(1).optional(),
  rules: ruleGroup.nullable().optional(),
  priority: z.number().int().default(0),
  isDefault: z.boolean().default(false),
});

export const updateFolderInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  downloadPath: z.string().min(1).nullable().optional(),
  libraryPath: z.string().min(1).nullable().optional(),
  qbitCategory: z.string().min(1).nullable().optional(),
  rules: ruleGroup.nullable().optional(),
  priority: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

// ── Media path inputs ──

export const addMediaPathInput = z.object({
  folderId: z.string().uuid(),
  path: z.string().min(1),
  label: z.string().max(100).optional(),
  source: z.string().max(20).optional(),
});

export const removeMediaPathInput = z.object({
  id: z.string().uuid(),
});

// ── Server link inputs ──

export const addServerLinkInput = z.object({
  folderId: z.string().uuid().optional(),
  serverType: z.enum(["jellyfin", "plex"]),
  serverLibraryId: z.string().min(1),
  serverLibraryName: z.string().optional(),
  serverPath: z.string().optional(),
  syncEnabled: z.boolean().default(false),
  contentType: z.enum(["movies", "shows"]).optional(),
});

export const removeServerLinkInput = z.object({
  id: z.string().uuid(),
});
