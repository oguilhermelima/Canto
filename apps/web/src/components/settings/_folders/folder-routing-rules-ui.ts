import type {
  RoutingRulesInput,
  RoutingRuleInput,
  RuleConditionInput,
} from "@canto/validators";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RuleCondition = RuleConditionInput;
export type RoutingRules = RoutingRulesInput;
export type RoutingRule = RoutingRuleInput;

/** UI-only shape: adds a stable `id` for keys + collapse state. Stripped on save. */
export type UIRule = {
  id: string;
  include: RuleCondition[];
  exclude: RuleCondition[];
};

export type UIRules = {
  rules: UIRule[];
};

/* -------------------------------------------------------------------------- */
/*  Ids                                                                        */
/* -------------------------------------------------------------------------- */

// crypto.randomUUID requires a secure context (https or localhost). Dev over
// LAN IP or any plain-http origin lacks it, so fall back to a non-crypto id
// that's only ever used as an ephemeral React list key.
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/*  Empty values                                                               */
/* -------------------------------------------------------------------------- */

export const EMPTY_CONDITION = (): RuleCondition =>
  ({ field: "type", op: "eq", value: "movie" }) as RuleCondition;

export const EMPTY_RULE = (): UIRule => ({
  id: randomId(),
  include: [],
  exclude: [],
});

/* -------------------------------------------------------------------------- */
/*  Cloning + UI <-> domain mapping                                            */
/* -------------------------------------------------------------------------- */

export function cloneCondition(c: RuleCondition): RuleCondition {
  return {
    ...c,
    value: Array.isArray(c.value) ? [...(c.value as unknown[])] : c.value,
  } as RuleCondition;
}

export function rulesToUI(rules: RoutingRules | null): UIRules {
  if (!rules || rules.rules.length === 0) {
    return { rules: [EMPTY_RULE()] };
  }
  return {
    rules: rules.rules.map((r) => ({
      id: randomId(),
      include: r.include,
      exclude: r.exclude ?? [],
    })),
  };
}

export function uiToRules(ui: UIRules): RoutingRules | null {
  const kept: RoutingRule[] = ui.rules
    .filter((r) => r.include.length > 0)
    .map((r) =>
      r.exclude.length > 0
        ? { include: r.include, exclude: r.exclude }
        : { include: r.include },
    );
  if (kept.length === 0) return null;
  return { rules: kept };
}

/* -------------------------------------------------------------------------- */
/*  Field / op / value option tables                                           */
/* -------------------------------------------------------------------------- */

export const FIELD_OPTIONS = [
  { value: "type", label: "Media type" },
  { value: "genre", label: "Genre" },
  { value: "originCountry", label: "Country of origin" },
  { value: "originalLanguage", label: "Original language" },
  { value: "contentRating", label: "Content rating" },
  { value: "year", label: "Year" },
  { value: "runtime", label: "Runtime (min)" },
  { value: "voteAverage", label: "Public rating" },
  { value: "status", label: "Status" },
  { value: "watchProvider", label: "Streaming" },
] as const;

export const OPS_BY_FIELD: Record<string, Array<{ value: string; label: string }>> = {
  type: [{ value: "eq", label: "is" }],
  genre: [
    { value: "contains_any", label: "includes" },
    { value: "contains_all", label: "requires every" },
    { value: "not_contains_any", label: "excludes" },
  ],
  genreId: [
    { value: "contains_any", label: "includes" },
    { value: "contains_all", label: "requires every" },
    { value: "not_contains_any", label: "excludes" },
  ],
  originCountry: [
    { value: "contains_any", label: "includes" },
    { value: "not_contains_any", label: "excludes" },
  ],
  originalLanguage: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
  ],
  contentRating: [
    { value: "eq", label: "is" },
    { value: "in", label: "is one of" },
  ],
  year: [
    { value: "eq", label: "is" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
  ],
  runtime: [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
  ],
  voteAverage: [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
  ],
  status: [
    { value: "eq", label: "is" },
    { value: "in", label: "is one of" },
  ],
  watchProvider: [
    { value: "contains_any", label: "includes" },
    { value: "not_contains_any", label: "excludes" },
  ],
};

export const STATUS_OPTIONS = [
  { value: "Returning Series", label: "Returning Series" },
  { value: "Ended", label: "Ended" },
  { value: "Canceled", label: "Canceled" },
  { value: "In Production", label: "In Production" },
  { value: "Planned", label: "Planned" },
  { value: "Pilot", label: "Pilot" },
  { value: "Released", label: "Released" },
  { value: "Post Production", label: "Post Production" },
  { value: "Rumored", label: "Rumored" },
];

export const CONTENT_RATINGS = [
  { value: "G", label: "G" },
  { value: "PG", label: "PG" },
  { value: "PG-13", label: "PG-13" },
  { value: "R", label: "R" },
  { value: "NC-17", label: "NC-17" },
  { value: "TV-Y", label: "TV-Y" },
  { value: "TV-Y7", label: "TV-Y7" },
  { value: "TV-G", label: "TV-G" },
  { value: "TV-PG", label: "TV-PG" },
  { value: "TV-14", label: "TV-14" },
  { value: "TV-MA", label: "TV-MA" },
];

export function defaultValueForField(field: string): unknown {
  if (field === "type") return "movie";
  if (field === "originalLanguage") return "en";
  if (field === "contentRating") return "";
  if (field === "year") return new Date().getFullYear();
  if (field === "runtime") return 60;
  if (field === "voteAverage") return 7;
  if (field === "status") return "Returning Series";
  if (field === "watchProvider") return { region: "US", providers: [] };
  return [];
}

/* -------------------------------------------------------------------------- */
/*  Human-readable rendering of a condition                                    */
/* -------------------------------------------------------------------------- */

export function describeCondition(c: RuleCondition): string {
  switch (c.field) {
    case "type":
      return c.value === "movie" ? "Movies" : "Shows";
    case "genre":
      return `genre ${
        c.op === "contains_all"
          ? "requires every"
          : c.op === "not_contains_any"
            ? "excludes"
            : "includes"
      } ${(c.value).join(", ")}`;
    case "genreId":
      return `genre ID ${
        c.op === "contains_all"
          ? "requires every"
          : c.op === "not_contains_any"
            ? "excludes"
            : "includes"
      } ${(c.value).join(", ")}`;
    case "originCountry":
      return `country ${
        c.op === "not_contains_any" ? "excludes" : "includes"
      } ${(c.value).join(", ")}`;
    case "originalLanguage":
      return `language ${c.op === "neq" ? "is not" : "is"} ${c.value}`;
    case "contentRating":
      return `rating ${c.op === "in" ? "is one of" : "is"} ${
        Array.isArray(c.value) ? (c.value).join(", ") : c.value
      }`;
    case "year":
      return `year ${
        c.op === "gte" ? "≥" : c.op === "lte" ? "≤" : "="
      } ${c.value}`;
    case "runtime":
      return `runtime ${c.op === "gte" ? "≥" : "≤"} ${c.value}min`;
    case "voteAverage":
      return `rating ${c.op === "gte" ? "≥" : "≤"} ${c.value}`;
    case "status":
      return `status ${c.op === "in" ? "is one of" : "is"} ${
        Array.isArray(c.value) ? (c.value).join(", ") : c.value
      }`;
    case "watchProvider": {
      const action = c.op === "not_contains_any" ? "not on" : "on";
      const ids = c.value.providers.join(", ");
      return `${action} ${ids || "(none)"} (${c.value.region})`;
    }
    default:
      return "unknown";
  }
}

/* -------------------------------------------------------------------------- */
/*  Shared input class strings                                                 */
/* -------------------------------------------------------------------------- */

export const ruleInputCn =
  "h-10 bg-accent rounded-xl border-none ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm";

export const cardInputCn =
  "h-10 bg-accent rounded-xl border-none ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm";
