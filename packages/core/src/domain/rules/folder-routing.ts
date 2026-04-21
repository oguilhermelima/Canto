import type {
  RuleCondition,
  RuleGroup,
  RoutingRule,
  RoutingRules,
  PersistedFolderRules,
} from "@canto/db/schema";

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
  year: number | null;
  runtime: number | null;
  voteAverage: number | null;
  status: string | null;
  /** Watch-provider availability — load from `mediaWatchProvider` before calling resolveFolder. */
  watchProviders: Array<{ providerId: number; region: string }> | null;
}

function arraysOverlap(a: unknown[] | null, b: unknown[]): boolean {
  if (!a) return false;
  return b.some((v) => a.includes(v));
}

function arraysContainAll(a: unknown[] | null, b: unknown[]): boolean {
  if (!a) return false;
  return b.every((v) => a.includes(v));
}

function evaluateCondition(cond: RuleCondition, media: RoutableMedia): boolean {
  switch (cond.field) {
    case "type":
      return cond.op === "eq" && media.type === cond.value;

    case "genre":
      if (cond.op === "contains_any") return arraysOverlap(media.genres, cond.value);
      if (cond.op === "contains_all") return arraysContainAll(media.genres, cond.value);
      if (cond.op === "not_contains_any") return !arraysOverlap(media.genres, cond.value);
      return false;

    case "genreId":
      if (cond.op === "contains_any") return arraysOverlap(media.genreIds, cond.value);
      if (cond.op === "contains_all") return arraysContainAll(media.genreIds, cond.value);
      if (cond.op === "not_contains_any") return !arraysOverlap(media.genreIds, cond.value);
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

    case "year":
      if (media.year == null) return false;
      if (cond.op === "eq") return media.year === cond.value;
      if (cond.op === "gte") return media.year >= cond.value;
      if (cond.op === "lte") return media.year <= cond.value;
      return false;

    case "runtime":
      if (media.runtime == null) return false;
      if (cond.op === "gte") return media.runtime >= cond.value;
      if (cond.op === "lte") return media.runtime <= cond.value;
      return false;

    case "voteAverage":
      if (media.voteAverage == null) return false;
      if (cond.op === "gte") return media.voteAverage >= cond.value;
      if (cond.op === "lte") return media.voteAverage <= cond.value;
      return false;

    case "status":
      if (media.status == null) return false;
      if (cond.op === "eq") return media.status === cond.value;
      if (cond.op === "in") return Array.isArray(cond.value) ? cond.value.includes(media.status) : media.status === cond.value;
      return false;

    case "watchProvider": {
      if (!media.watchProviders) return false;
      const inRegion = media.watchProviders.filter((w) => w.region === cond.value.region);
      const hasAny = cond.value.providers.some((p) => inRegion.some((w) => w.providerId === p));
      if (cond.op === "contains_any") return hasAny;
      if (cond.op === "not_contains_any") return !hasAny;
      return false;
    }

    default:
      return false;
  }
}

function evaluateRule(rule: RoutingRule, media: RoutableMedia): boolean {
  const includeOk = rule.include.every((c) => evaluateCondition(c, media));
  if (!includeOk) return false;
  const excludeAllMatch =
    rule.exclude !== undefined &&
    rule.exclude.length > 0 &&
    rule.exclude.every((c) => evaluateCondition(c, media));
  return !excludeAllMatch;
}

function evaluateRoutingRules(rules: RoutingRules, media: RoutableMedia): boolean {
  return rules.rules.some((r) => evaluateRule(r, media));
}

/* ---------- Legacy → routing-rules normalization ---------- */

function isLegacyGroup(node: unknown): node is RuleGroup {
  return (
    typeof node === "object" &&
    node !== null &&
    "operator" in node &&
    "conditions" in node
  );
}

function isRoutingRules(node: unknown): node is RoutingRules {
  return (
    typeof node === "object" &&
    node !== null &&
    "rules" in node &&
    Array.isArray((node as { rules: unknown }).rules)
  );
}

/** Convert a legacy AND/OR group tree into DNF: a list of AND-lists (each becomes a rule's `include`). */
function legacyToDNF(node: RuleCondition | RuleGroup): RuleCondition[][] {
  if (!isLegacyGroup(node)) return [[node]];
  const childrenDNF = node.conditions.map(legacyToDNF);
  if (node.operator === "AND") {
    return childrenDNF.reduce<RuleCondition[][]>((acc, cur) => {
      if (acc.length === 0) return cur;
      const out: RuleCondition[][] = [];
      for (const a of acc) for (const c of cur) out.push([...a, ...c]);
      return out;
    }, []);
  }
  // OR: union of branches
  return childrenDNF.flat();
}

function legacyToRoutingRules(group: RuleGroup): RoutingRules {
  const branches = legacyToDNF(group).filter((b) => b.length > 0);
  if (branches.length === 0) return { rules: [] };
  return { rules: branches.map((include) => ({ include })) };
}

/**
 * Normalize whatever shape is stored in `download_folder.rules` into the current `RoutingRules` shape.
 * Accepts new shape, legacy AND/OR group, or null. Legacy data is converted via DNF expansion.
 */
export function normalizeFolderRules(raw: PersistedFolderRules | null | undefined): RoutingRules | null {
  if (raw == null) return null;
  if (isRoutingRules(raw)) return raw;
  if (isLegacyGroup(raw)) return legacyToRoutingRules(raw);
  return null;
}

/**
 * Given all download folders sorted by priority, return the best folder for this media.
 *
 * 1. Evaluate rules in priority order — first match wins
 * 2. Fall back to the isDefault folder
 * 3. Fall back to the first enabled folder
 */
export function resolveFolder(
  folders: Array<{
    id: string;
    rules: PersistedFolderRules | null;
    isDefault: boolean;
    enabled: boolean;
  }>,
  media: RoutableMedia,
): string | null {
  const enabled = folders.filter((f) => f.enabled);

  for (const folder of enabled) {
    const normalized = normalizeFolderRules(folder.rules);
    if (normalized && evaluateRoutingRules(normalized, media)) {
      return folder.id;
    }
  }

  const defaultFolder = enabled.find((f) => f.isDefault);
  if (defaultFolder) return defaultFolder.id;

  return enabled[0]?.id ?? null;
}
