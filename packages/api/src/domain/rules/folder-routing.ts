import type { RuleCondition, RuleGroup } from "@canto/db/schema";

/**
 * Media metadata used for rule evaluation.
 * All fields match columns on the `media` table.
 */
export interface RoutableMedia {
  type: string;
  genres: string[] | null;
  genreIds: number[] | null;
  originCountry: string[] | null;
  originalLanguage: string | null;
  contentRating: string | null;
  provider: string;
}

function isRuleGroup(node: RuleCondition | RuleGroup): node is RuleGroup {
  return "operator" in node && "conditions" in node;
}

function arraysOverlap(a: unknown[] | null, b: unknown[]): boolean {
  if (!a) return false;
  return b.some((v) => a.includes(v));
}

function arraysContainAll(a: unknown[] | null, b: unknown[]): boolean {
  if (!a) return false;
  return b.every((v) => a.includes(v));
}

/**
 * Evaluate a single condition against media metadata.
 */
function evaluateCondition(cond: RuleCondition, media: RoutableMedia): boolean {
  switch (cond.field) {
    case "type":
      return cond.op === "eq" && media.type === cond.value;

    case "genre":
      if (cond.op === "contains_any") return arraysOverlap(media.genres, cond.value);
      if (cond.op === "contains_all") return arraysContainAll(media.genres, cond.value);
      return false;

    case "genreId":
      if (cond.op === "contains_any") return arraysOverlap(media.genreIds, cond.value);
      if (cond.op === "contains_all") return arraysContainAll(media.genreIds, cond.value);
      return false;

    case "originCountry":
      if (cond.op === "contains_any") return arraysOverlap(media.originCountry, cond.value);
      if (cond.op === "not_contains_any") return !arraysOverlap(media.originCountry, cond.value);
      return false;

    case "originalLanguage":
      if (cond.op === "eq") return media.originalLanguage === cond.value;
      if (cond.op === "neq") return media.originalLanguage !== cond.value;
      return false;

    case "contentRating":
      if (cond.op === "eq") return media.contentRating === cond.value;
      if (cond.op === "in") return Array.isArray(cond.value) ? cond.value.includes(media.contentRating ?? "") : media.contentRating === cond.value;
      return false;

    case "provider":
      return cond.op === "eq" && media.provider === cond.value;

    default:
      return false;
  }
}

/**
 * Recursively evaluate a rule group (AND/OR) against media metadata.
 */
function evaluateGroup(group: RuleGroup, media: RoutableMedia): boolean {
  if (group.operator === "AND") {
    return group.conditions.every((node) =>
      isRuleGroup(node) ? evaluateGroup(node, media) : evaluateCondition(node, media),
    );
  }
  // OR
  return group.conditions.some((node) =>
    isRuleGroup(node) ? evaluateGroup(node, media) : evaluateCondition(node, media),
  );
}

/**
 * Given all download folders sorted by priority, return the best folder for this media.
 *
 * 1. Evaluate rules in priority order — first match wins
 * 2. Fall back to the isDefault folder
 * 3. Fall back to the first enabled folder
 */
export function resolveFolder(
  folders: Array<{ id: string; rules: RuleGroup | null; isDefault: boolean; enabled: boolean }>,
  media: RoutableMedia,
): string | null {
  const enabled = folders.filter((f) => f.enabled);

  // First pass: evaluate rules
  for (const folder of enabled) {
    if (folder.rules && evaluateGroup(folder.rules, media)) {
      return folder.id;
    }
  }

  // Fallback: default folder
  const defaultFolder = enabled.find((f) => f.isDefault);
  if (defaultFolder) return defaultFolder.id;

  // Last resort: first enabled folder
  return enabled[0]?.id ?? null;
}
