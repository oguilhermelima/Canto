import { z } from "zod";

// ── Condition schema (leaves of a rule) ──

const ruleCondition = z.discriminatedUnion("field", [
  z.object({ field: z.literal("type"), op: z.literal("eq"), value: z.enum(["movie", "show"]) }),
  z.object({ field: z.literal("genre"), op: z.enum(["contains_any", "contains_all", "not_contains_any"]), value: z.array(z.string()) }),
  z.object({ field: z.literal("genreId"), op: z.enum(["contains_any", "contains_all", "not_contains_any"]), value: z.array(z.number()) }),
  z.object({ field: z.literal("originCountry"), op: z.enum(["contains_any", "not_contains_any"]), value: z.array(z.string()) }),
  z.object({ field: z.literal("originalLanguage"), op: z.enum(["eq", "neq"]), value: z.string() }),
  z.object({ field: z.literal("contentRating"), op: z.enum(["eq", "in"]), value: z.union([z.string(), z.array(z.string())]) }),
  z.object({ field: z.literal("provider"), op: z.literal("eq"), value: z.enum(["tmdb", "tvdb"]) }),
  z.object({ field: z.literal("year"), op: z.enum(["eq", "gte", "lte"]), value: z.number().int() }),
  z.object({ field: z.literal("runtime"), op: z.enum(["gte", "lte"]), value: z.number().int() }),
  z.object({ field: z.literal("voteAverage"), op: z.enum(["gte", "lte"]), value: z.number() }),
  z.object({ field: z.literal("status"), op: z.enum(["eq", "in"]), value: z.union([z.string(), z.array(z.string())]) }),
  z.object({
    field: z.literal("watchProvider"),
    op: z.enum(["contains_any", "not_contains_any"]),
    value: z.object({
      region: z.string().length(2),
      providers: z.array(z.number().int()).min(1),
    }),
  }),
]);

// ── Routing rules schema ──
// A folder matches when ANY rule matches.
// A rule matches when all its include conditions pass and its exclude conditions don't all match.
// Rules OR together; conditions inside a rule AND together.

const routingRule = z.object({
  include: z.array(ruleCondition).min(1),
  exclude: z.array(ruleCondition).optional(),
});

const routingRules = z.object({
  rules: z.array(routingRule).min(1),
});

export type RuleConditionInput = z.infer<typeof ruleCondition>;
export type RoutingRuleInput = z.infer<typeof routingRule>;
export type RoutingRulesInput = z.infer<typeof routingRules>;

// ── Legacy recursive AND/OR schema (kept for on-read migration of stored data) ──

export type LegacyRuleGroup = {
  operator: "AND" | "OR";
  conditions: Array<z.infer<typeof ruleCondition> | LegacyRuleGroup>;
};

const legacyRuleGroup: z.ZodType<LegacyRuleGroup> = z.object({
  operator: z.enum(["AND", "OR"]),
  conditions: z.array(z.lazy(() => z.union([ruleCondition, legacyRuleGroup]))),
});

/** @deprecated Use `RoutingRulesInput`. Kept for read-side migration only. */
export type RuleGroupInput = LegacyRuleGroup;

export { ruleCondition, routingRule, routingRules, legacyRuleGroup };

// ── Folder CRUD inputs ──

export const createFolderInput = z.object({
  name: z.string().min(1).max(100),
  downloadPath: z.string().min(1).optional(),
  libraryPath: z.string().min(1).optional(),
  qbitCategory: z.string().min(1).optional(),
  rules: routingRules.nullable().optional(),
  priority: z.number().int().default(0),
  isDefault: z.boolean().default(false),
});

export const updateFolderInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  downloadPath: z.string().min(1).nullable().optional(),
  libraryPath: z.string().min(1).nullable().optional(),
  qbitCategory: z.string().min(1).nullable().optional(),
  rules: routingRules.nullable().optional(),
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
  serverType: z.enum(["jellyfin", "plex"]),
  serverLibraryId: z.string().min(1),
  serverLibraryName: z.string().optional(),
  serverPath: z.string().optional(),
  syncEnabled: z.boolean().default(false),
  contentType: z.enum(["movies", "shows"]).optional(),
  userConnectionId: z.string().uuid().optional(),
});

export const removeServerLinkInput = z.object({
  id: z.string().uuid(),
});

export const browseFolderInput = z.object({
  path: z.string().default("/"),
});
export type BrowseFolderInput = z.infer<typeof browseFolderInput>;

export const listServerLinksInput = z.object({
  serverType: z.enum(["jellyfin", "plex"]).optional(),
});
export type ListServerLinksInput = z.infer<typeof listServerLinksInput>;

export const updateServerLinkInput = z.object({
  id: z.string().uuid(),
  syncEnabled: z.boolean().optional(),
});
export type UpdateServerLinkInput = z.infer<typeof updateServerLinkInput>;

export const listMediaPathsInput = z.object({
  folderId: z.string().uuid(),
});
export type ListMediaPathsInput = z.infer<typeof listMediaPathsInput>;

export const toggleLibraryInput = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});
export type ToggleLibraryInput = z.infer<typeof toggleLibraryInput>;

export const createQbitCategoryInput = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100)
    .regex(/^[^\\/]+$/, "Category name cannot contain / or \\"),
  savePath: z.string().min(1, "Save path is required").max(500),
});
export type CreateQbitCategoryInput = z.infer<typeof createQbitCategoryInput>;
