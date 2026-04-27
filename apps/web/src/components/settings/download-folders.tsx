"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Skeleton } from "@canto/ui/skeleton";
import { Switch } from "@canto/ui/switch";
import { Badge } from "@canto/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import {
  Folder,
  Plus,
  Check,
  Loader2,
  FolderOpen,
  Trash2,
  Pencil,
  X,
  Wand2,
  ChevronDown,
  ChevronRight,
  CornerLeftUp,
  FolderSearch,
  ScanSearch,
  Download,
  ShieldCheck,
  Copy,
  SatelliteDish,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// crypto.randomUUID requires a secure context (https or localhost). Dev over
// LAN IP or any plain-http origin lacks it, so fall back to a non-crypto id
// that's only ever used as an ephemeral React list key.
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/*  Animated collapse                                                          */
/* -------------------------------------------------------------------------- */

function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      // Update height on content changes while open
      const observer = new ResizeObserver(() => {
        if (contentRef.current) setHeight(contentRef.current.scrollHeight);
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    } else {
      setHeight(0);
    }
  }, [open]);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: open ? height : 0, opacity: open ? 1 : 0 }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

import type {
  RoutingRulesInput,
  RoutingRuleInput,
  RuleConditionInput,
} from "@canto/validators";

type RuleCondition = RuleConditionInput;
type RoutingRules = RoutingRulesInput;
type RoutingRule = RoutingRuleInput;

/** UI-only shape: adds a stable `id` for keys + collapse state. Stripped on save. */
type UIRule = {
  id: string;
  include: RuleCondition[];
  exclude: RuleCondition[];
};
type UIRules = {
  rules: UIRule[];
};

const EMPTY_CONDITION = (): RuleCondition =>
  ({ field: "type", op: "eq", value: "movie" }) as RuleCondition;

const EMPTY_RULE = (): UIRule => ({
  id: randomId(),
  include: [],
  exclude: [],
});

function cloneCondition(c: RuleCondition): RuleCondition {
  return {
    ...c,
    value: Array.isArray(c.value) ? [...(c.value as unknown[])] : c.value,
  } as RuleCondition;
}

function rulesToUI(rules: RoutingRules | null): UIRules {
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

function uiToRules(ui: UIRules): RoutingRules | null {
  const kept: RoutingRule[] = ui.rules
    .filter((r) => r.include.length > 0)
    .map((r) => (r.exclude.length > 0
      ? { include: r.include, exclude: r.exclude }
      : { include: r.include }
    ));
  if (kept.length === 0) return null;
  return { rules: kept };
}

/* -------------------------------------------------------------------------- */
/*  Rule helpers                                                               */
/* -------------------------------------------------------------------------- */

const FIELD_OPTIONS = [
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

const OPS_BY_FIELD: Record<string, Array<{ value: string; label: string }>> = {
  type: [{ value: "eq", label: "is" }],
  genre: [{ value: "contains_any", label: "includes" }, { value: "contains_all", label: "requires every" }, { value: "not_contains_any", label: "excludes" }],
  genreId: [{ value: "contains_any", label: "includes" }, { value: "contains_all", label: "requires every" }, { value: "not_contains_any", label: "excludes" }],
  originCountry: [{ value: "contains_any", label: "includes" }, { value: "not_contains_any", label: "excludes" }],
  originalLanguage: [{ value: "eq", label: "is" }, { value: "neq", label: "is not" }],
  contentRating: [{ value: "eq", label: "is" }, { value: "in", label: "is one of" }],
  year: [{ value: "eq", label: "is" }, { value: "gte", label: "≥" }, { value: "lte", label: "≤" }],
  runtime: [{ value: "gte", label: "≥" }, { value: "lte", label: "≤" }],
  voteAverage: [{ value: "gte", label: "≥" }, { value: "lte", label: "≤" }],
  status: [{ value: "eq", label: "is" }, { value: "in", label: "is one of" }],
  watchProvider: [{ value: "contains_any", label: "includes" }, { value: "not_contains_any", label: "excludes" }],
};

const STATUS_OPTIONS = [
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

function describeCondition(c: RuleCondition): string {
  switch (c.field) {
    case "type": return c.value === "movie" ? "Movies" : "Shows";
    case "genre": return `genre ${c.op === "contains_all" ? "requires every" : c.op === "not_contains_any" ? "excludes" : "includes"} ${(c.value as string[]).join(", ")}`;
    case "genreId": return `genre ID ${c.op === "contains_all" ? "requires every" : c.op === "not_contains_any" ? "excludes" : "includes"} ${(c.value as number[]).join(", ")}`;
    case "originCountry": return `country ${c.op === "not_contains_any" ? "excludes" : "includes"} ${(c.value as string[]).join(", ")}`;
    case "originalLanguage": return `language ${c.op === "neq" ? "is not" : "is"} ${c.value as string}`;
    case "contentRating": return `rating ${c.op === "in" ? "is one of" : "is"} ${Array.isArray(c.value) ? (c.value as string[]).join(", ") : c.value}`;
    case "year": return `year ${c.op === "gte" ? "≥" : c.op === "lte" ? "≤" : "="} ${c.value}`;
    case "runtime": return `runtime ${c.op === "gte" ? "≥" : "≤"} ${c.value}min`;
    case "voteAverage": return `rating ${c.op === "gte" ? "≥" : "≤"} ${c.value}`;
    case "status": return `status ${c.op === "in" ? "is one of" : "is"} ${Array.isArray(c.value) ? (c.value as string[]).join(", ") : c.value}`;
    case "watchProvider": {
      const action = c.op === "not_contains_any" ? "not on" : "on";
      const ids = c.value.providers.join(", ");
      return `${action} ${ids || "(none)"} (${c.value.region})`;
    }
    default: return "unknown";
  }
}

function FolderRulesPreview({ rules }: { rules: RoutingRules }): React.JSX.Element {
  if (rules.rules.length === 0) return <></>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rules.rules.map((rule, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              or
            </span>
          )}
          {rule.include.map((c, j) => (
            <span
              key={`i-${j}`}
              className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300"
            >
              {describeCondition(c)}
            </span>
          ))}
          {rule.exclude && rule.exclude.length > 0 && (
            <>
              <span className="text-[11px] text-muted-foreground">except</span>
              {rule.exclude.map((c, j) => (
                <span
                  key={`e-${j}`}
                  className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300"
                >
                  {describeCondition(c)}
                </span>
              ))}
            </>
          )}
        </Fragment>
      ))}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/*  Content rating options                                                     */
/* -------------------------------------------------------------------------- */

const CONTENT_RATINGS = [
  { value: "G", label: "G" }, { value: "PG", label: "PG" }, { value: "PG-13", label: "PG-13" },
  { value: "R", label: "R" }, { value: "NC-17", label: "NC-17" },
  { value: "TV-Y", label: "TV-Y" }, { value: "TV-Y7", label: "TV-Y7" }, { value: "TV-G", label: "TV-G" },
  { value: "TV-PG", label: "TV-PG" }, { value: "TV-14", label: "TV-14" }, { value: "TV-MA", label: "TV-MA" },
];

/* -------------------------------------------------------------------------- */
/*  Multi-select chip input                                                    */
/* -------------------------------------------------------------------------- */

function ChipSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = (v: string): void => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex min-h-[40px] w-full cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-left text-sm transition-colors hover:bg-accent/80",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          {value.length === 0 ? (
            <span>{placeholder ?? "Select..."}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {options.find((o) => o.value === v)?.label ?? v}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggle(v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggle(v); } }}
                    className="hover:text-destructive transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-0" onWheel={(e) => e.stopPropagation()}>
        <div
          className="max-h-[240px] overflow-y-auto p-1.5"
          onWheel={(e) => {
            e.stopPropagation();
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
        {options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                selected ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-accent",
              )}
            >
              <div className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground",
              )}>
                {selected && <Check className="h-2.5 w-2.5" />}
              </div>
              {opt.label}
            </button>
          );
        })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Watch provider input (region + providers)                                 */
/* -------------------------------------------------------------------------- */

function WatchProviderInput({
  value,
  onChange,
}: {
  value: { region: string; providers: number[] };
  onChange: (v: { region: string; providers: number[] }) => void;
}): React.JSX.Element {
  const { data: regionsRaw } = trpc.provider.filterOptions.useQuery(
    { type: "regions" },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );
  const { data: movieProvidersRaw } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: "movie", region: value.region },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000, enabled: !!value.region },
  );
  const { data: showProvidersRaw } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: "show", region: value.region },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000, enabled: !!value.region },
  );

  const regionOptions = useMemo(() => {
    const list = (regionsRaw ?? []) as Array<{ code: string; englishName: string }>;
    return list
      .map((r) => ({ value: r.code, label: `${r.englishName} (${r.code})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [regionsRaw]);

  const providerOptions = useMemo(() => {
    const map = new Map<number, { value: string; label: string }>();
    const pushAll = (list: unknown): void => {
      for (const p of ((list ?? []) as Array<{ providerId: number; providerName: string }>)) {
        if (!map.has(p.providerId)) {
          map.set(p.providerId, { value: String(p.providerId), label: p.providerName });
        }
      }
    };
    pushAll(movieProvidersRaw);
    pushAll(showProvidersRaw);
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [movieProvidersRaw, showProvidersRaw]);

  return (
    <div className="flex w-full flex-col gap-2">
      <Select
        value={value.region}
        onValueChange={(region) => onChange({ region, providers: [] })}
      >
        <SelectTrigger className={cn(ruleInputCn, "w-full")}>
          <SelectValue placeholder="Region" />
        </SelectTrigger>
        <SelectContent>
          {regionOptions.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChipSelect
        value={value.providers.map(String)}
        onChange={(v) => onChange({ region: value.region, providers: v.map(Number) })}
        options={providerOptions}
        placeholder={value.region ? "Select streaming services..." : "Pick a region first"}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Condition editor                                                           */
/* -------------------------------------------------------------------------- */

const ruleInputCn = "h-10 bg-accent rounded-xl border-none ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm";

function defaultValueForField(field: string): unknown {
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

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  showHints = true,
}: {
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
  showHints?: boolean;
}): React.JSX.Element {
  const ops = OPS_BY_FIELD[condition.field] ?? [];

  // Fetch dynamic data
  const { data: movieGenres } = trpc.provider.genres.useQuery({ type: "movie" });
  const { data: showGenres } = trpc.provider.genres.useQuery({ type: "show" });
  const { data: regions } = trpc.provider.filterOptions.useQuery({ type: "regions" });

  const genreOptions = [...new Map(
    [...(movieGenres ?? []), ...(showGenres ?? [])].map((g) => [g.name, { value: g.name, label: g.name }]),
  ).values()].sort((a, b) => a.label.localeCompare(b.label));

  const countryOptions = ((regions ?? []) as Array<{ code: string; englishName: string }>)
    .map((r) => ({ value: r.code, label: `${r.englishName} (${r.code})` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const handleFieldChange = (field: string): void => {
    const newOps = OPS_BY_FIELD[field];
    const op = newOps?.[0]?.value ?? "eq";
    const value = defaultValueForField(field);
    onChange({ field, op, value } as unknown as RuleCondition);
  };

  const arrayValue = Array.isArray(condition.value) ? (condition.value as string[]) : [];

  return (
    <>
    <div className="flex items-start gap-2">
      {/* Field selector */}
      <Select value={condition.field} onValueChange={handleFieldChange}>
        <SelectTrigger className={cn(ruleInputCn, "w-[160px] shrink-0")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator */}
      {ops.length > 1 ? (
        <Select value={condition.op} onValueChange={(op) => onChange({ ...condition, op } as unknown as RuleCondition)}>
          <SelectTrigger className={cn(ruleInputCn, "w-[130px] shrink-0")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="shrink-0 text-sm text-muted-foreground px-2 h-10 flex items-center">{ops[0]?.label ?? "is"}</span>
      )}

      {/* Value — dropdown for everything */}
      <div className="flex-1 min-w-0">
        {condition.field === "type" ? (
          <Select value={String(condition.value)} onValueChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}>
            <SelectTrigger className={cn(ruleInputCn, "w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="movie">Movie</SelectItem>
              <SelectItem value="show">Show</SelectItem>
            </SelectContent>
          </Select>
        ) : condition.field === "originalLanguage" ? (
          <Select value={String(condition.value)} onValueChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}>
            <SelectTrigger className={cn(ruleInputCn, "w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {[
                { value: "en", label: "English" }, { value: "pt", label: "Portuguese" }, { value: "es", label: "Spanish" },
                { value: "fr", label: "French" }, { value: "de", label: "German" }, { value: "it", label: "Italian" },
                { value: "ja", label: "Japanese" }, { value: "ko", label: "Korean" }, { value: "zh", label: "Chinese" },
                { value: "ru", label: "Russian" }, { value: "ar", label: "Arabic" }, { value: "hi", label: "Hindi" },
                { value: "nl", label: "Dutch" }, { value: "pl", label: "Polish" }, { value: "sv", label: "Swedish" },
                { value: "tr", label: "Turkish" }, { value: "th", label: "Thai" },
              ].map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label} ({l.value})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : condition.field === "contentRating" && condition.op === "in" ? (
          <ChipSelect
            value={Array.isArray(condition.value) ? (condition.value as string[]) : condition.value ? [String(condition.value)] : []}
            onChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}
            options={CONTENT_RATINGS}
            placeholder="Select ratings..."
          />
        ) : condition.field === "contentRating" ? (
          <Select value={String(condition.value)} onValueChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}>
            <SelectTrigger className={cn(ruleInputCn, "w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTENT_RATINGS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : condition.field === "genre" ? (
          <ChipSelect
            value={arrayValue}
            onChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}
            options={genreOptions}
            placeholder="Select genres..."
          />
        ) : condition.field === "originCountry" ? (
          <ChipSelect
            value={arrayValue}
            onChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}
            options={countryOptions}
            placeholder="Select countries..."
          />
        ) : condition.field === "year" || condition.field === "runtime" || condition.field === "voteAverage" ? (
          <Input
            type="number"
            step={condition.field === "voteAverage" ? "0.1" : "1"}
            min={condition.field === "voteAverage" ? 0 : 0}
            max={condition.field === "voteAverage" ? 10 : undefined}
            value={typeof condition.value === "number" ? condition.value : ""}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === "" ? 0 : Number(raw);
              if (Number.isNaN(num)) return;
              onChange({ ...condition, value: num } as unknown as RuleCondition);
            }}
            placeholder={condition.field === "year" ? "2024" : condition.field === "runtime" ? "60" : "7.0"}
            className={ruleInputCn}
          />
        ) : condition.field === "status" && condition.op === "in" ? (
          <ChipSelect
            value={Array.isArray(condition.value) ? (condition.value as string[]) : condition.value ? [String(condition.value)] : []}
            onChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}
            options={STATUS_OPTIONS}
            placeholder="Select statuses..."
          />
        ) : condition.field === "status" ? (
          <Select value={String(condition.value)} onValueChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}>
            <SelectTrigger className={cn(ruleInputCn, "w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : condition.field === "watchProvider" ? (
          <WatchProviderInput
            value={condition.value as { region: string; providers: number[] }}
            onChange={(v) => onChange({ ...condition, value: v } as unknown as RuleCondition)}
          />
        ) : (
          <Input
            value={Array.isArray(condition.value) ? arrayValue.join(", ") : String(condition.value)}
            onChange={(e) => {
              const raw = e.target.value;
              const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
              onChange({ ...condition, value: arr } as unknown as RuleCondition);
            }}
            placeholder="value"
            className={ruleInputCn}
          />
        )}
      </div>

      {/* Remove */}
      <button type="button" onClick={onRemove} className="shrink-0 rounded-lg p-2.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors mt-0.5">
        <X className="h-4 w-4" />
      </button>
    </div>
    {/* Inline hint for operators that need clarification */}
    {showHints && condition.field === "genre" && (
      <p className="text-sm text-muted-foreground pl-[172px] pt-0.5">
        {condition.op === "contains_all"
          ? "The media must have every selected genre."
          : condition.op === "not_contains_any"
          ? "The media must not have any of the selected genres."
          : "The media can have any of the selected genres."}
      </p>
    )}
    {showHints && condition.field === "originCountry" && (
      <p className="text-sm text-muted-foreground pl-[172px] pt-0.5">
        {condition.op === "not_contains_any"
          ? "The media must not be from any of these countries."
          : "The media must be from at least one of these countries."}
      </p>
    )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rules editor                                                               */
/* -------------------------------------------------------------------------- */

/** A single AND-group list of conditions with a colored left bar. */
function ConditionBlock({
  conditions,
  accent,
  onChange,
}: {
  conditions: RuleCondition[];
  accent: "emerald" | "red";
  onChange: (next: RuleCondition[]) => void;
}): React.JSX.Element {
  const updateCondition = (i: number, c: RuleCondition): void => {
    const next = [...conditions];
    next[i] = c;
    onChange(next);
  };
  const removeCondition = (i: number): void => {
    onChange(conditions.filter((_, j) => j !== i));
  };
  const addCondition = (): void => {
    onChange([...conditions, EMPTY_CONDITION()]);
  };

  const accentCn = accent === "emerald"
    ? "border-l-emerald-500/40 bg-emerald-500/[0.03]"
    : "border-l-red-500/40 bg-red-500/[0.03]";

  return (
    <div className={cn(
      "rounded-xl border border-border border-l-[3px] p-3.5 space-y-2",
      accentCn,
    )}>
      {conditions.map((c, i) => (
        <ConditionEditor
          key={i}
          condition={c}
          onChange={(c) => updateCondition(i, c)}
          onRemove={() => removeCondition(i)}
          showHints={accent === "emerald"}
        />
      ))}
      <button
        type="button"
        onClick={addCondition}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        + Add condition
      </button>
    </div>
  );
}

/** A dashed empty-state button that creates the first condition of an AND-group. */
function EmptyBlockButton({
  accent,
  label,
  onClick,
}: {
  accent: "emerald" | "red";
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  const accentCn = accent === "emerald"
    ? "border-emerald-500/25 bg-emerald-500/[0.02] hover:border-emerald-500/50"
    : "border-red-500/25 bg-red-500/[0.02] hover:border-red-500/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border border-dashed px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground transition-colors",
        accentCn,
      )}
    >
      {label}
    </button>
  );
}

/** Compact chip row summarizing a rule for the collapsed state. */
function RuleSummary({ rule }: { rule: UIRule }): React.JSX.Element {
  const hasInclude = rule.include.length > 0;
  const hasExclude = rule.exclude.length > 0;

  if (!hasInclude && !hasExclude) {
    return <span className="truncate text-sm italic text-muted-foreground">Empty rule</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {rule.include.map((c, i) => (
        <span
          key={`i-${i}`}
          className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300"
        >
          {describeCondition(c)}
        </span>
      ))}
      {hasExclude && (
        <>
          <span className="shrink-0 text-xs text-muted-foreground">except</span>
          {rule.exclude.map((c, i) => (
            <span
              key={`e-${i}`}
              className="shrink-0 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300"
            >
              {describeCondition(c)}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/** One rule = Include (required) + Exclude (optional). */
function RuleCard({
  rule,
  index,
  total,
  collapsed,
  onChange,
  onRemove,
  onDuplicate,
  onToggleCollapse,
}: {
  rule: UIRule;
  index: number;
  total: number;
  collapsed: boolean;
  onChange: (next: UIRule) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleCollapse: () => void;
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-muted/10 p-5">
      {/* Rule header */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <span className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            Rule {index + 1}
          </span>
          {collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <RuleSummary rule={rule} />
            </div>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate this rule"
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Copy className="h-4 w-4" />
          </button>
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove this rule"
              className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible body */}
      <AnimatedCollapse open={!collapsed}>
        <div className="space-y-4 pt-4">
          {/* Include */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Include — all must match
            </h4>
            {rule.include.length === 0 ? (
              <EmptyBlockButton
                accent="emerald"
                label="+ Add the first include condition"
                onClick={() => onChange({ ...rule, include: [EMPTY_CONDITION()] })}
              />
            ) : (
              <ConditionBlock
                conditions={rule.include}
                accent="emerald"
                onChange={(c) => onChange({ ...rule, include: c })}
              />
            )}
          </div>

          {/* Exclude */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-red-400">
              Exclude — all must match
              <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">(optional)</span>
            </h4>
            {rule.exclude.length === 0 ? (
              <EmptyBlockButton
                accent="red"
                label="+ Add an exclusion"
                onClick={() => onChange({ ...rule, exclude: [EMPTY_CONDITION()] })}
              />
            ) : (
              <ConditionBlock
                conditions={rule.exclude}
                accent="red"
                onChange={(c) => onChange({ ...rule, exclude: c })}
              />
            )}
          </div>
        </div>
      </AnimatedCollapse>
    </div>
  );
}

function RulesEditor({
  value,
  onChange,
}: {
  value: UIRules;
  onChange: (next: UIRules) => void;
}): React.JSX.Element {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateRule = (idx: number, next: UIRule): void => {
    const rules = [...value.rules];
    rules[idx] = next;
    onChange({ rules });
  };

  const removeRule = (idx: number): void => {
    const removed = value.rules[idx];
    const rules = value.rules.filter((_, i) => i !== idx);
    if (removed) {
      setCollapsedIds((prev) => {
        if (!prev.has(removed.id)) return prev;
        const next = new Set(prev);
        next.delete(removed.id);
        return next;
      });
    }
    onChange({ rules: rules.length === 0 ? [EMPTY_RULE()] : rules });
  };

  const duplicateRule = (idx: number): void => {
    const original = value.rules[idx];
    if (!original) return;
    const clone: UIRule = {
      id: randomId(),
      include: original.include.map(cloneCondition),
      exclude: original.exclude.map(cloneCondition),
    };
    const rules = [...value.rules];
    rules.splice(idx + 1, 0, clone);
    onChange({ rules });
  };

  const addRule = (): void => {
    onChange({ rules: [...value.rules, EMPTY_RULE()] });
  };

  return (
    <div className="space-y-4">
      {value.rules.map((r, i) => (
        <div key={r.id} className="space-y-4">
          {i > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/30" />
              <span className="rounded-md bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                or
              </span>
              <div className="h-px flex-1 bg-border/30" />
            </div>
          )}
          <RuleCard
            rule={r}
            index={i}
            total={value.rules.length}
            collapsed={collapsedIds.has(r.id)}
            onChange={(n) => updateRule(i, n)}
            onRemove={() => removeRule(i)}
            onDuplicate={() => duplicateRule(i)}
            onToggleCollapse={() => toggleCollapse(r.id)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addRule}
        className="w-full rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.03] hover:text-foreground transition-colors"
      >
        + Add another rule
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rules editor dialog                                                        */
/* -------------------------------------------------------------------------- */

function RulesEditorDialog({
  open,
  onOpenChange,
  rules,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RoutingRules | null;
  onSave: (rules: RoutingRules | null) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<UIRules>(() => rulesToUI(rules));

  useEffect(() => {
    if (open) setDraft(rulesToUI(rules));
  }, [open, rules]);

  const hasAny = draft.rules.some(
    (r) => r.include.length > 0 || r.exclude.length > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[780px] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader bar>
          <DialogTitle>Auto-routing Rules</DialogTitle>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Route a download here when any rule matches. Each rule: include conditions (all required) and optional exclude conditions.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <RulesEditor value={draft} onChange={setDraft} />
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            className="rounded-xl text-muted-foreground"
            onClick={() => { onSave(null); onOpenChange(false); }}
          >
            Clear rules
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => { onSave(hasAny ? uiToRules(draft) : null); onOpenChange(false); }}
            >
              Save rules
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Folder data type                                                           */
/* -------------------------------------------------------------------------- */

interface FolderData {
  id: string;
  name: string;
  downloadPath: string | null;
  libraryPath: string | null;
  qbitCategory: string | null;
  rules: RoutingRules | null;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Folder card                                                                */
/* -------------------------------------------------------------------------- */

const cardInputCn = "h-10 bg-accent rounded-xl border-none ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm";

/* -------------------------------------------------------------------------- */
/*  Source badge colors                                                        */
/* -------------------------------------------------------------------------- */

const SOURCE_BADGE_COLORS: Record<string, string> = {
  manual: "bg-muted text-muted-foreground",
  jellyfin: "bg-purple-500/10 text-purple-400",
  plex: "bg-amber-500/10 text-amber-400",
  download: "bg-blue-500/10 text-blue-400",
};

/* -------------------------------------------------------------------------- */
/*  Media Paths section (inside FolderCard)                                    */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- planned for future use
function MediaPathsSection({ folderId, isLocal }: { folderId: string; isLocal: boolean }): React.JSX.Element {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const mediaPaths = trpc.folder.listMediaPaths.useQuery(
    { folderId },
    { enabled: open },
  );

  const addPath = trpc.folder.addMediaPath.useMutation({
    onSuccess: () => {
      toast.success("Media path added");
      setNewPath("");
      setNewLabel("");
      setAdding(false);
      void utils.folder.listMediaPaths.invalidate({ folderId });
    },
    onError: (err) => toast.error(err.message),
  });

  const removePath = trpc.folder.removeMediaPath.useMutation({
    onSuccess: () => {
      toast.success("Media path removed");
      void utils.folder.listMediaPaths.invalidate({ folderId });
    },
    onError: (err) => toast.error(err.message),
  });

  const paths = mediaPaths.data ?? [];

  return (
    <div className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between py-1 text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-foreground">Additional paths</p>
          {paths.length > 0 && (
            <span className="text-xs text-muted-foreground">{paths.length}</span>
          )}
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatedCollapse open={open}>
        <div className="pt-2 space-y-2">
          {mediaPaths.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-8 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : paths.length > 0 ? (
            <div className="space-y-1.5">
              {paths.map((mp) => (
                <div key={mp.id} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2">
                  <p className="text-sm text-foreground truncate flex-1 font-mono">{mp.path}</p>
                  {mp.label && (
                    <span className="text-xs text-muted-foreground shrink-0">{mp.label}</span>
                  )}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "shrink-0 text-[10px] px-1.5 py-0 border-0",
                      SOURCE_BADGE_COLORS[mp.source ?? "manual"] ?? SOURCE_BADGE_COLORS.manual,
                    )}
                  >
                    {mp.source ?? "manual"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => removePath.mutate({ id: mp.id })}
                    disabled={removePath.isPending}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic py-1">
              If Jellyfin, Plex, or other servers use a different path for this same content, add it here so Canto can track it.
            </p>
          )}

          {/* Add path form */}
          {adding ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                {isLocal ? (
                  <PathInput
                    value={newPath}
                    onChange={setNewPath}
                    placeholder="/path/to/media"
                    className={cn(cardInputCn, "flex-1 h-8 text-xs")}
                  />
                ) : (
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/path/to/media"
                    className={cn(cardInputCn, "flex-1 h-8 text-xs")}
                    autoFocus
                  />
                )}
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className={cn(cardInputCn, "w-[120px] h-8 text-xs")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs rounded-lg"
                  disabled={!newPath || addPath.isPending}
                  onClick={() => addPath.mutate({
                    folderId,
                    path: newPath,
                    label: newLabel || undefined,
                    source: "manual",
                  })}
                >
                  {addPath.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                  Add
                </Button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewPath(""); setNewLabel(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-sm text-primary hover:text-primary transition-colors font-medium pt-1"
            >
              + Add path
            </button>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  qBittorrent path select — dropdown-only with "create new" modal            */
/* -------------------------------------------------------------------------- */

type QbitPathOption = { category: string; savePath: string };

const CREATE_SENTINEL = "__create_new__";

function QbitPathSelect({
  value,
  onChange,
  onCategoryChange,
  placeholder,
  className,
  options,
  showCategoryHint = true,
}: {
  value: string;
  onChange: (value: string) => void;
  /** When set, called with the category name whenever the selection changes. */
  onCategoryChange?: (category: string) => void;
  placeholder?: string;
  className?: string;
  options: QbitPathOption[];
  /** Show the category name under each option in the dropdown list. Trigger always shows path only. */
  showCategoryHint?: boolean;
}): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Ensure the current value appears as an option even if it's not in the
  // live qBit list (e.g. saved previously, category renamed, offline).
  const augmented: QbitPathOption[] = value && !options.some((o) => o.savePath === value)
    ? [{ category: "current", savePath: value }, ...options]
    : options;

  const handleSelect = (savePath: string): void => {
    onChange(savePath);
    if (onCategoryChange) {
      const match = augmented.find((o) => o.savePath === savePath);
      if (match && match.category !== "current") {
        onCategoryChange(match.category);
      }
    }
  };

  const handleCreated = (savePath: string, category: string): void => {
    onChange(savePath);
    if (onCategoryChange) onCategoryChange(category);
  };

  return (
    <>
      <Select
        value={value || undefined}
        onValueChange={(v) => {
          if (v === CREATE_SENTINEL) {
            setDialogOpen(true);
            return;
          }
          handleSelect(v);
        }}
      >
        <SelectTrigger className={className}>
          {value ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="truncate text-muted-foreground">
              {placeholder ?? "Select a qBittorrent path"}
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CREATE_SENTINEL}>
            <div className="flex items-center gap-2 text-primary">
              <Plus className="h-4 w-4" />
              <span className="font-medium">Create new qBittorrent path</span>
            </div>
          </SelectItem>
          {augmented.length > 0 && (
            <div className="my-1 h-px bg-border/40" aria-hidden="true" />
          )}
          {augmented.map((opt) => (
            <SelectItem key={`${opt.category}:${opt.savePath}`} value={opt.savePath}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{opt.savePath}</span>
                {showCategoryHint && opt.category !== "current" && (
                  <span className="truncate text-xs text-muted-foreground">
                    {opt.category}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CreateQbitCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </>
  );
}

function CreateQbitCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (savePath: string, category: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState("");
  const [savePath, setSavePath] = useState("");
  const utils = trpc.useUtils();

  const createCat = trpc.folder.createQbitCategory.useMutation({
    onSuccess: (data) => {
      toast.success(`Category "${data.name}" created and validated`);
      void utils.folder.qbitCategories.invalidate();
      onCreated(data.savePath, data.name);
      onOpenChange(false);
      setName("");
      setSavePath("");
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit = name.trim().length > 0 && savePath.trim().length > 0 && !createCat.isPending;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    createCat.mutate({ name: name.trim(), savePath: savePath.trim() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (createCat.isPending) return;
        onOpenChange(next);
        if (!next) {
          setName("");
          setSavePath("");
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Create qBittorrent category</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Category name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. movies"
              autoFocus
              disabled={createCat.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Save path</label>
            <Input
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder="/data/downloads/movies"
              disabled={createCat.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Must be an absolute path writable by the qBittorrent server. The category is validated immediately — invalid paths are rolled back.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createCat.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {createCat.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating</>
              ) : (
                <>Create & validate</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Path input with folder browser                                             */
/* -------------------------------------------------------------------------- */

function PathInput({
  value,
  onChange,
  placeholder,
  className,
  showBrowser = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Show the folder browser button. Disable for remote paths (qBittorrent namespace). */
  showBrowser?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState(value || "/");
  const { data, isLoading } = trpc.folder.browse.useQuery(
    { path: browsePath },
    { enabled: open },
  );

  const handleOpen = (nextOpen: boolean): void => {
    if (nextOpen) setBrowsePath(value || "/");
    setOpen(nextOpen);
  };

  const handleSelect = (path: string): void => {
    onChange(path);
    setOpen(false);
  };

  if (!showBrowser) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(className, "flex-1")}
      />
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Browse folders"
          >
            <FolderSearch className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-sm font-medium text-foreground truncate">{data?.path ?? browsePath}</p>
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1.5">
            {/* Go up */}
            {data?.parent && data.parent !== data.path && (
              <button
                type="button"
                onClick={() => setBrowsePath(data.parent)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <CornerLeftUp className="h-4 w-4 shrink-0" />
                ..
              </button>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : data?.dirs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No subfolders</p>
            ) : (
              data?.dirs.map((dir) => (
                <div key={dir.path} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleSelect(dir.path)}
                    className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent transition-colors min-w-0"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{dir.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrowsePath(dir.path)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Open folder"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          {/* Select current folder */}
          <div className="border-t border-border p-2">
            <Button
              size="sm"
              className="w-full rounded-xl gap-2"
              onClick={() => handleSelect(data?.path ?? browsePath)}
            >
              <Check className="h-3.5 w-3.5" />
              Select this folder
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FolderCard({
  folder,
  expanded,
  onToggle,
  onRefresh,
  importMethod = "local",
  qbitOptions,
}: {
  folder: FolderData;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  importMethod?: "local" | "remote";
  /** qBittorrent category options for the path dropdown (remote mode only) */
  qbitOptions?: QbitPathOption[];
}): React.JSX.Element {
  const isLocal = importMethod === "local";
  const [name, setName] = useState(folder.name);
  const [dlPath, setDlPath] = useState(folder.downloadPath ?? "");
  const [libPath, setLibPath] = useState(folder.libraryPath ?? "");
  const [qbitCat, setQbitCat] = useState(folder.qbitCategory ?? "");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [editingDlPath, setEditingDlPath] = useState(!!folder.downloadPath);
  const [editingLibPath, setEditingLibPath] = useState(!!folder.libraryPath);

  const dirty =
    name !== folder.name ||
    dlPath !== (folder.downloadPath ?? "") ||
    libPath !== (folder.libraryPath ?? "") ||
    qbitCat !== (folder.qbitCategory ?? "");

  // Sync state from server, but skip when user has unsaved edits
  const prevFolderId = useRef(folder.id);
  useEffect(() => {
    const isNewFolder = folder.id !== prevFolderId.current;
    prevFolderId.current = folder.id;
    if (isNewFolder || !dirty) {
      setName(folder.name);
      setDlPath(folder.downloadPath ?? "");
      setLibPath(folder.libraryPath ?? "");
      setQbitCat(folder.qbitCategory ?? "");
      setEditingDlPath(!!folder.downloadPath);
      setEditingLibPath(!!folder.libraryPath);
    }
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFolder = trpc.folder.update.useMutation({
    onSuccess: () => { toast.success("Saved"); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteFolder = trpc.folder.delete.useMutation({
    onSuccess: () => { toast.success("Library deleted"); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const setDefault = trpc.folder.setDefault.useMutation({
    onSuccess: () => { toast.success("Fallback updated"); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (): void => {
    updateFolder.mutate({
      id: folder.id,
      name,
      downloadPath: dlPath || null,
      libraryPath: libPath || null,
      qbitCategory: qbitCat || null,
    });
  };

  const handleSaveRules = (rules: RoutingRules | null): void => {
    updateFolder.mutate({ id: folder.id, rules });
  };

  const needsConfig = !folder.downloadPath || !folder.libraryPath;

  return (
    <>
      <div className={cn(
        "rounded-2xl border transition-colors overflow-hidden",
        needsConfig ? "border-amber-500/30 bg-amber-500/[0.02]" : "border-border",
      )}>
        {/* Header — always visible */}
        <div className="flex w-full items-start gap-3 px-4 sm:px-5 py-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex flex-1 items-start gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
          >
            <Folder className={cn("mt-0.5 h-5 w-5 shrink-0", needsConfig ? "text-amber-500/60" : "text-primary")} />
            {expanded ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="h-auto rounded-none border-0 border-b border-border bg-transparent p-0 pb-1 text-base font-semibold text-foreground shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary caret-primary"
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <p className="text-base font-semibold text-foreground truncate">{folder.name}</p>
                {needsConfig && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400 shrink-0">Needs paths</span>
                )}
                {!folder.enabled && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground shrink-0">Disabled</span>
                )}
              </div>
            )}
          </button>
          {expanded && (
            <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <button type="button" onClick={onToggle} className="mt-0.5 shrink-0">
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
          </button>
        </div>

        {/* Expanded editor */}
        <AnimatedCollapse open={expanded}>
          <div className="border-t border-border px-4 sm:px-5 py-5">

            {/* ── Download ── */}
            <div className="mt-2 flex items-center gap-3">
              <Download className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Download</p>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Where your torrent client saves files while downloading and seeding.
            </p>
            <div className="mt-3 space-y-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <label className="text-sm font-medium text-muted-foreground sm:w-28 sm:shrink-0 sm:text-right">Download path</label>
                <div className="flex-1">
                  {editingDlPath ? (
                    isLocal ? (
                      <PathInput value={dlPath} onChange={setDlPath} placeholder="/data/downloads/movies" className={cardInputCn} />
                    ) : (
                      <QbitPathSelect
                        value={dlPath}
                        onChange={setDlPath}
                        onCategoryChange={setQbitCat}
                        placeholder="Select a qBittorrent path"
                        className={cardInputCn}
                        options={qbitOptions ?? []}
                      />
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDlPath(true)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Set download path
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <label className="text-sm font-medium text-muted-foreground sm:w-28 sm:shrink-0 sm:text-right">qBit category</label>
                <div className="sm:w-48">
                  {isLocal ? (
                    <Input
                      value={qbitCat}
                      onChange={(e) => setQbitCat(e.target.value)}
                      placeholder="e.g. movies"
                      className={cardInputCn}
                    />
                  ) : (
                    <Input
                      value={qbitCat}
                      readOnly
                      placeholder="Auto from path"
                      className={cn(cardInputCn, "bg-muted/20 text-muted-foreground cursor-default")}
                      title="Category is derived from the selected qBittorrent path"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ── Storage ── */}
            <div className="mt-8 flex items-center gap-3">
              <FolderOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Storage</p>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {isLocal
                ? "After importing, Canto moves files here and renames them so media servers like Jellyfin and Plex can recognize them. Point your media server to this path."
                : "After downloading, qBittorrent moves files here and Canto renames them so media servers like Jellyfin and Plex can recognize them. Point your media server to this path."}
            </p>
            <div className="mt-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <label className="text-sm font-medium text-muted-foreground sm:w-28 sm:shrink-0 sm:text-right">Storage path</label>
                <div className="flex-1">
                  {editingLibPath ? (
                    isLocal ? (
                      <PathInput value={libPath} onChange={setLibPath} placeholder="/data/media/movies" className={cardInputCn} />
                    ) : (
                      <QbitPathSelect
                        value={libPath}
                        onChange={setLibPath}
                        placeholder="Select a qBittorrent path"
                        className={cardInputCn}
                        options={qbitOptions ?? []}
                        showCategoryHint={false}
                      />
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingLibPath(true)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-emerald-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Set storage path
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Routing ── */}
            <div className="mt-8 flex items-center gap-3">
              <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Routing</p>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Automatically assign downloads to this library based on media metadata.
            </p>

            {/* Rules */}
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Rules</p>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-xl text-xs" onClick={() => setRulesOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit rules
                </Button>
              </div>
              {folder.rules ? (
                <div className="mt-3">
                  <FolderRulesPreview rules={folder.rules} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground italic">
                  No rules — this library will only be used when manually selected.
                </p>
              )}
            </div>

            {/* ── Fallback ── */}
            <div className="mt-8 flex items-center gap-3">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fallback</p>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Use this library when no routing rules match a download.
              </p>
              <Switch
                checked={folder.isDefault}
                onCheckedChange={(checked) => { if (checked) setDefault.mutate({ id: folder.id }); }}
                disabled={folder.isDefault || setDefault.isPending}
              />
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <button type="button" onClick={() => deleteFolder.mutate({ id: folder.id })} disabled={deleteFolder.isPending} className="text-sm text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Delete library
              </button>
              {dirty && (
                <Button size="sm" className="rounded-xl gap-2" onClick={handleSave} disabled={updateFolder.isPending}>
                  {updateFolder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save changes
                </Button>
              )}
            </div>
          </div>
        </AnimatedCollapse>
      </div>

      <RulesEditorDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={folder.rules} onSave={handleSaveRules} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Custom library dialog                                                       */
/* -------------------------------------------------------------------------- */

function CustomFolderDialog({
  open,
  onOpenChange,
  onCreated,
  basePath,
  importMethod: _importMethod = "local",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  basePath: string;
  importMethod?: "local" | "remote";
}): React.JSX.Element {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  const createFolder = trpc.folder.create.useMutation({
    onSuccess: () => {
      toast.success("Library created");
      onCreated();
      onOpenChange(false);
      setName("");
      setCategory("");
    },
    onError: (err) => toast.error(err.message),
  });

  const slug = category || name.toLowerCase().replace(/\s+/g, "-");
  const root = basePath.replace(/\/+$/, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Library</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Folder name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 4K Movies" className={cardInputCn} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">qBittorrent category</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. 4k-movies (optional)" className={cardInputCn} />
          </div>
          {root && slug && (
            <div className="rounded-xl bg-muted/30 px-4 py-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Generated paths</p>
              <p className="text-sm text-foreground font-mono">{root}/downloads/{slug}</p>
              <p className="text-sm text-foreground font-mono">{root}/media/{slug}</p>
            </div>
          )}
          <Button
            className="w-full rounded-xl"
            onClick={() =>
              createFolder.mutate({
                name,
                downloadPath: root && slug ? `${root}/downloads/${slug}` : undefined,
                libraryPath: root && slug ? `${root}/media/${slug}` : undefined,
                qbitCategory: category || undefined,
                priority: 10,
              })
            }
            disabled={!name || createFolder.isPending}
          >
            {createFolder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Scan & import directories                                                  */
/* -------------------------------------------------------------------------- */

function ScanFoldersDialog({
  open,
  onOpenChange,
  onCreated,
  pathType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  pathType: "download" | "library";
}): React.JSX.Element {
  const [scanPath, setScanPath] = useState("/");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, isLoading } = trpc.folder.browse.useQuery({ path: scanPath }, { enabled: open });

  const createFolder = trpc.folder.create.useMutation({
    onSuccess: () => void onCreated(),
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open, scanPath]);

  const toggle = (path: string, _name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const handleImport = (): void => {
    for (const dirPath of selected) {
      const name = dirPath.split("/").pop() ?? "Unnamed";
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      createFolder.mutate({
        name,
        downloadPath: pathType === "download" ? dirPath : undefined,
        libraryPath: pathType === "library" ? dirPath : undefined,
        qbitCategory: slug,
        priority: 10,
      });
    }
    toast.success(`Importing ${selected.size} folder${selected.size > 1 ? "s" : ""}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import {pathType === "download" ? "download" : "storage"} folders</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Browse to a directory and select folders to import. Each selected folder becomes a new library
          with its path set as the {pathType === "download" ? "download" : "storage"} path.
        </p>

        <div className="space-y-3 pt-2">
          {/* Path browser */}
          <PathInput value={scanPath} onChange={setScanPath} placeholder="/" className="h-10 bg-accent rounded-xl border-none text-sm" />

          {/* Folder list with checkboxes */}
          <div className="rounded-xl border border-border overflow-hidden">
            {data?.parent && data.parent !== data.path && (
              <button
                type="button"
                onClick={() => setScanPath(data.parent)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors border-b border-border"
              >
                <CornerLeftUp className="h-4 w-4 shrink-0" />
                ..
              </button>
            )}
            <div className="max-h-[280px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : data?.dirs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No subfolders found</p>
              ) : (
                data?.dirs.map((dir) => {
                  const isSelected = selected.has(dir.path);
                  return (
                    <div key={dir.path} className="flex items-center border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => toggle(dir.path, dir.name)}
                        className={cn(
                          "flex flex-1 items-center gap-3 px-3 py-2.5 text-sm transition-colors min-w-0",
                          isSelected ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-accent",
                        )}
                      >
                        <div className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{dir.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScanPath(dir.path)}
                        className="shrink-0 px-3 py-2.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <Button
            className="w-full rounded-xl"
            disabled={selected.size === 0 || createFolder.isPending}
            onClick={handleImport}
          >
            {createFolder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Import {selected.size > 0 ? `${selected.size} folder${selected.size > 1 ? "s" : ""}` : "selected folders"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add-from-qBittorrent dialog                                                */
/* -------------------------------------------------------------------------- */

function AddFromQbittorrentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: qbitData, isLoading: qbitLoading } =
    trpc.folder.qbitCategories.useQuery(undefined, { enabled: open });
  const { data: folders } = trpc.folder.list.useQuery(undefined, { enabled: open });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const importedKeys = useMemo(
    () =>
      new Set(
        (folders ?? [])
          .map((f) => f.qbitCategory?.toLowerCase())
          .filter((v): v is string => Boolean(v)),
      ),
    [folders],
  );

  const rows = useMemo(() => {
    if (!qbitData) return [] as { name: string; savePath: string; imported: boolean }[];
    return Object.entries(qbitData.categories).map(([name, cat]) => ({
      name,
      savePath: cat.savePath || "",
      imported: importedKeys.has(name.toLowerCase()),
    }));
  }, [qbitData, importedKeys]);

  const selectableRows = useMemo(() => rows.filter((r) => !r.imported), [rows]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.name));

  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  const toggle = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.name)));
  };

  const createFolder = trpc.folder.create.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = async (): Promise<void> => {
    if (!qbitData || selected.size === 0) return;
    const defaultPath = qbitData.defaultSavePath.replace(/\/+$/, "");
    let imported = 0;
    for (const name of selected) {
      const cat = qbitData.categories[name];
      if (!cat) continue;
      const dlPath = cat.savePath || (defaultPath ? `${defaultPath}/${name}` : undefined);
      try {
        await createFolder.mutateAsync({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          downloadPath: dlPath,
          qbitCategory: name,
          priority: 10,
        });
        imported++;
      } catch {
        // toast already fired by mutation onError
      }
    }
    if (imported > 0) {
      toast.success(`Added ${imported} folder${imported > 1 ? "s" : ""}`);
      void utils.folder.list.invalidate();
      onCreated();
      onOpenChange(false);
    }
  };

  const isPending = createFolder.isPending;
  const empty = !qbitLoading && rows.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add from qBittorrent</DialogTitle>
        </DialogHeader>

        {qbitLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : empty ? (
          <div className="py-6 text-center space-y-1">
            <SatelliteDish className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No signals from qBittorrent</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Create a category in qBittorrent first — Canto can&apos;t bootstrap remote paths.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={toggleAll}
              disabled={selectableRows.length === 0}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-left rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {allSelected && <Check className="h-3 w-3" />}
              </div>
              <span className="font-medium text-foreground">
                {allSelected ? "Deselect all" : "Select all"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {selected.size}/{selectableRows.length}
              </span>
            </button>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="max-h-[320px] overflow-y-auto">
                {rows.map((row) => {
                  const isSelected = selected.has(row.name);
                  const disabled = row.imported;
                  return (
                    <button
                      key={row.name}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(row.name)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left border-b border-border last:border-0 transition-colors min-w-0",
                        disabled
                          ? "text-muted-foreground cursor-not-allowed bg-muted/20"
                          : isSelected
                            ? "bg-primary/5 text-foreground"
                            : "text-foreground hover:bg-accent",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          disabled
                            ? "border-border bg-muted"
                            : isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                        )}
                      >
                        {(isSelected || disabled) && <Check className="h-3 w-3" />}
                      </div>
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{row.name}</span>
                        {row.savePath && (
                          <span className="truncate text-xs text-muted-foreground font-mono">
                            {row.savePath}
                          </span>
                        )}
                      </div>
                      {disabled && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          Added
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={selected.size === 0 || isPending || empty}
            onClick={() => void handleSubmit()}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add {selected.size > 0 ? `${selected.size} folder${selected.size > 1 ? "s" : ""}` : "selected"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

interface DownloadFoldersProps {
  mode?: "settings" | "onboarding";
  onComplete?: () => void;
  /** Import method — controls whether cards show 1 or 2 paths */
  importMethod?: "local" | "remote";
}

function categoryToSubfolder(cat: string | null): string {
  return (cat ?? "default").toLowerCase();
}

export function DownloadFolders({ mode = "settings", importMethod: importMethodProp }: DownloadFoldersProps): React.JSX.Element {
  // Resolve import method: prop (onboarding) or fetch from settings
  const { data: dlSettings } = trpc.library.getDownloadSettings.useQuery(undefined, { enabled: !importMethodProp });
  const effectiveMethod = importMethodProp ?? (dlSettings?.importMethod as "local" | "remote" | undefined) ?? "local";
  const utils = trpc.useUtils();
  const [basePath, setBasePath] = useState("/data");
  // eslint-disable-next-line prefer-const -- kept as toggle for future use
  let showBasePath = false;
  const [customOpen, setCustomOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPathType, setScanPathType] = useState<"download" | "library">("library");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addQbitOpen, setAddQbitOpen] = useState(false);

  const { data: folders, isLoading } = trpc.folder.list.useQuery();
  const { data: qbitData } = trpc.folder.qbitCategories.useQuery(undefined, { enabled: effectiveMethod === "remote" });
  const seedFolders = trpc.folder.seed.useMutation({
    onSuccess: () => {
      toast.success("Default folders created");
      void utils.folder.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateFolder = trpc.folder.update.useMutation({
    onSuccess: () => void utils.folder.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const testPaths = trpc.folder.testPaths.useMutation({
    onSuccess: (results) => {
      const allOk = results.every((r) => r.downloadPath.ok && r.libraryPath.ok);
      if (allOk) toast.success("All paths are accessible and writable");
      else {
        const issues = results
          .flatMap((r) => [
            !r.downloadPath.ok ? `${r.name} download: ${r.downloadPath.error}` : null,
            !r.libraryPath.ok ? `${r.name} library: ${r.libraryPath.error}` : null,
          ])
          .filter(Boolean);
        toast.error(`Path issues: ${issues.join("; ")}`);
      }
    },
    onError: () => toast.error("Failed to test paths"),
  });

  const refresh = useCallback(() => {
    void utils.folder.list.invalidate();
  }, [utils]);


  const allFolders = folders ?? [];

  // Build qBittorrent category options for the dropdown (remote mode).
  // Only include categories with a non-empty savePath — paths without one
  // cannot be validated and would lead to the same bug this dropdown fixes.
  const qbitOptions: QbitPathOption[] = (() => {
    if (!qbitData) return [];
    const out: QbitPathOption[] = [];
    const seen = new Set<string>();
    for (const [catName, cat] of Object.entries(qbitData.categories)) {
      if (!cat.savePath) continue;
      const key = `${catName}:${cat.savePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ category: catName, savePath: cat.savePath });
    }
    return out;
  })();

  const handleGeneratePaths = (): void => {
    const root = basePath.replace(/\/+$/, "");
    if (!root) return;
    let count = 0;
    for (const folder of allFolders) {
      const sub = categoryToSubfolder(folder.qbitCategory);
      const dl = `${root}/downloads/${sub}`;
      const lib = `${root}/media/${sub}`;
      if (folder.downloadPath !== dl || folder.libraryPath !== lib) {
        updateFolder.mutate({ id: folder.id, downloadPath: dl, libraryPath: lib });
        count++;
      }
    }
    if (count > 0) toast.success(`Paths generated for ${count} folder${count > 1 ? "s" : ""}`);
    else toast.info("All paths already match");
  };

  /* Loading */
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />)}
      </div>
    );
  }

  /* Empty state */
  if (allFolders.length === 0 && !seedFolders.isPending) {
    return (
      <div className="space-y-6">
        {/* Base path — only when not provided externally */}
        {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- toggle for future use */}
        {showBasePath && (
          <div className="rounded-2xl border border-border bg-muted/5 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">Base path</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Where Canto stores everything. Download and library subfolders are generated per category.
            </p>
            <PathInput
              value={basePath}
              onChange={setBasePath}
              placeholder="/data"
              className="h-10 bg-accent rounded-xl border-none text-sm"
            />
          </div>
        )}

        {/* Action buttons */}
        {effectiveMethod === "local" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => { setScanPathType("library"); setScanOpen(true); }}>
              <ScanSearch className="h-4 w-4" />
              Import from filesystem
            </Button>
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => setCustomOpen(true)}>
              <Plus className="h-4 w-4" />
              Custom library
            </Button>
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => seedFolders.mutate()}>
              <Wand2 className="h-4 w-4" />
              Create suggested libraries
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddQbitOpen(true)}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/[0.03] px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add from qBittorrent
          </button>
        )}

        <CustomFolderDialog open={customOpen} onOpenChange={setCustomOpen} onCreated={refresh} basePath={basePath} importMethod={effectiveMethod} />
        <ScanFoldersDialog open={scanOpen} onOpenChange={setScanOpen} onCreated={refresh} pathType={scanPathType} />
        <AddFromQbittorrentDialog open={addQbitOpen} onOpenChange={setAddQbitOpen} onCreated={refresh} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Base path + generate — only when not provided externally */}
      {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- toggle for future use */}
      {showBasePath && (
        <div className="rounded-2xl border border-border bg-muted/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Base path</p>
            <span className="text-sm text-muted-foreground">
              — generates <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded-md">/downloads/</code> and <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded-md">/media/</code> subfolders
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <PathInput
                value={basePath}
                onChange={setBasePath}
                placeholder="/data"
                className="h-10 bg-accent rounded-xl border-none text-sm"
              />
            </div>
            <Button className="h-10 rounded-xl gap-2" onClick={handleGeneratePaths} disabled={!basePath || updateFolder.isPending}>
              {updateFolder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate paths
            </Button>
            {mode === "settings" && (
              <Button variant="outline" className="h-10 rounded-xl gap-2" onClick={() => testPaths.mutate()} disabled={testPaths.isPending}>
                {testPaths.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Test paths
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {effectiveMethod === "local" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => { setScanPathType("library"); setScanOpen(true); }}>
            <ScanSearch className="h-4 w-4" />
            Import from filesystem
          </Button>
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => setCustomOpen(true)}>
            <Plus className="h-4 w-4" />
            Custom library
          </Button>
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => seedFolders.mutate()} disabled={seedFolders.isPending}>
            {seedFolders.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Create suggested libraries
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddQbitOpen(true)}
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/[0.03] px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add from qBittorrent
        </button>
      )}

      {/* Folder cards */}
      <div className="space-y-3">
        {allFolders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            expanded={expandedId === folder.id}
            onToggle={() => setExpandedId(expandedId === folder.id ? null : folder.id)}
            onRefresh={refresh}
            importMethod={effectiveMethod}
            qbitOptions={qbitOptions}
          />
        ))}
      </div>

      <CustomFolderDialog open={customOpen} onOpenChange={setCustomOpen} onCreated={refresh} basePath={basePath} importMethod={effectiveMethod} />
      <ScanFoldersDialog open={scanOpen} onOpenChange={setScanOpen} onCreated={refresh} pathType={scanPathType} />
      <AddFromQbittorrentDialog open={addQbitOpen} onOpenChange={setAddQbitOpen} onCreated={refresh} />
    </div>
  );
}
