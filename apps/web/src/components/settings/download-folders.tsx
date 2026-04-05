"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import {
  Folder,
  Plus,
  Check,
  Loader2,
  FolderDown,
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
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";

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

import type { RuleGroupInput } from "@canto/validators";

type RuleGroup = RuleGroupInput;
type RuleCondition = Exclude<RuleGroup["conditions"][number], RuleGroup>;

/* -------------------------------------------------------------------------- */
/*  Rule helpers                                                               */
/* -------------------------------------------------------------------------- */

const FIELD_OPTIONS = [
  { value: "type", label: "Media type" },
  { value: "genre", label: "Genre" },
  { value: "originCountry", label: "Country of origin" },
  { value: "originalLanguage", label: "Original language" },
  { value: "contentRating", label: "Content rating" },
] as const;

const OPS_BY_FIELD: Record<string, Array<{ value: string; label: string }>> = {
  type: [{ value: "eq", label: "is" }],
  genre: [{ value: "contains_any", label: "includes" }, { value: "contains_all", label: "requires every" }],
  genreId: [{ value: "contains_any", label: "includes" }, { value: "contains_all", label: "requires every" }],
  originCountry: [{ value: "contains_any", label: "includes" }, { value: "not_contains_any", label: "excludes" }],
  originalLanguage: [{ value: "eq", label: "is" }, { value: "neq", label: "is not" }],
  contentRating: [{ value: "eq", label: "is" }, { value: "in", label: "is one of" }],
};

function describeCondition(c: RuleCondition): string {
  switch (c.field) {
    case "type": return c.value === "movie" ? "Movies" : "Shows";
    case "genre": return `genre ${c.op === "contains_all" ? "requires every" : "includes"} ${(c.value as string[]).join(", ")}`;
    case "genreId": return `genre ID ${c.op === "contains_all" ? "requires every" : "includes"} ${(c.value as number[]).join(", ")}`;
    case "originCountry": return `country ${c.op === "not_contains_any" ? "excludes" : "includes"} ${(c.value as string[]).join(", ")}`;
    case "originalLanguage": return `language ${c.op === "neq" ? "is not" : "is"} ${c.value as string}`;
    case "contentRating": return `rating ${c.op === "in" ? "is one of" : "is"} ${Array.isArray(c.value) ? (c.value as string[]).join(", ") : c.value}`;
    default: return "unknown";
  }
}

function describeGroup(g: RuleGroup): string {
  const parts = g.conditions.map((c) => {
    if ("operator" in c) return `(${describeGroup(c as RuleGroup)})`;
    return describeCondition(c as RuleCondition);
  });
  return parts.join(g.operator === "AND" ? " + " : " or ");
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
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent align="start" className="w-[240px] p-1.5 max-h-[240px] overflow-y-auto">
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
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border/60",
              )}>
                {selected && <Check className="h-2.5 w-2.5" />}
              </div>
              {opt.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
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
  return [];
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
}: {
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
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
      <button type="button" onClick={onRemove} className="shrink-0 rounded-lg p-2.5 text-muted-foreground/40 hover:text-destructive hover:bg-accent transition-colors mt-0.5">
        <X className="h-4 w-4" />
      </button>
    </div>
    {/* Inline hint for operators that need clarification */}
    {condition.field === "genre" && (
      <p className="text-sm text-muted-foreground/40 pl-[172px] pt-0.5">
        {condition.op === "contains_all"
          ? "The media must have every selected genre."
          : "The media can have any of the selected genres."}
      </p>
    )}
    {condition.field === "originCountry" && (
      <p className="text-sm text-muted-foreground/40 pl-[172px] pt-0.5">
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

/** Static AND/OR label between items */
function ConnectorLabel({ value }: { value: "AND" | "OR" }): React.JSX.Element {
  const isAnd = value === "AND";
  return (
    <div className="flex items-center gap-2 py-1 pl-3">
      <span className={cn(
        "text-xs font-bold uppercase tracking-wider",
        isAnd ? "text-blue-400/50" : "text-amber-400/50",
      )}>
        {isAnd ? "and" : "or"}
      </span>
      <div className="h-px flex-1 bg-border/20" />
    </div>
  );
}

/** Inline toggle to switch between ALL/ANY */
function OperatorToggle({ value, onChange }: { value: "AND" | "OR"; onChange: (v: "AND" | "OR") => void }): React.JSX.Element {
  const isAnd = value === "AND";
  return (
    <div className="inline-flex rounded-xl border border-border/40 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("AND")}
        className={cn("px-3 py-1 text-sm font-medium transition-colors", isAnd ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
      >
        all
      </button>
      <button
        type="button"
        onClick={() => onChange("OR")}
        className={cn("px-3 py-1 text-sm font-medium transition-colors", !isAnd ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
      >
        any
      </button>
    </div>
  );
}

/** A set of conditions with its own operator */
function ConditionSet({
  group,
  onChange,
  onRemove,
}: {
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const isAnd = group.operator === "AND";
  const conditions = group.conditions.filter((c) => !("operator" in c)) as RuleCondition[];

  const updateCondition = (idx: number, c: RuleCondition): void => {
    const next = [...conditions];
    next[idx] = c;
    onChange({ ...group, conditions: next });
  };

  const removeCondition = (idx: number): void => {
    const next = conditions.filter((_, i) => i !== idx);
    if (next.length === 0) { onRemove(); return; }
    onChange({ ...group, conditions: next });
  };

  const addCondition = (): void => {
    onChange({ ...group, conditions: [...conditions, { field: "type", op: "eq", value: "movie" } as RuleCondition] });
  };

  return (
    <div className={cn(
      "rounded-xl border-l-[3px] border border-border/20 p-4 space-y-2",
      isAnd ? "border-l-blue-500/30 bg-blue-500/[0.03]" : "border-l-amber-500/30 bg-amber-500/[0.03]",
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <OperatorToggle value={group.operator} onChange={(op) => onChange({ ...group, operator: op })} />
          <span>of these must match</span>
        </div>
        <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-accent transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      {conditions.map((c, i) => (
        <div key={i}>
          <ConditionEditor condition={c} onChange={(c) => updateCondition(i, c)} onRemove={() => removeCondition(i)} />
          {i < conditions.length - 1 && <ConnectorLabel value={group.operator} />}
        </div>
      ))}
      <button type="button" onClick={addCondition} className="text-sm text-muted-foreground/60 hover:text-foreground transition-colors">
        + Add new condition to this set
      </button>
    </div>
  );
}

function RulesEditor({
  rules,
  onChange,
}: {
  rules: RuleGroup;
  onChange: (rules: RuleGroup) => void;
}): React.JSX.Element {
  const items = rules.conditions;

  const updateItem = (idx: number, c: RuleCondition | RuleGroup): void => {
    const next = [...items];
    next[idx] = c;
    onChange({ ...rules, conditions: next });
  };

  const removeItem = (idx: number): void => {
    onChange({ ...rules, conditions: items.filter((_, i) => i !== idx) });
  };

  const addCondition = (): void => {
    onChange({ ...rules, conditions: [...items, { field: "type", op: "eq", value: "movie" } as RuleCondition] });
  };

  const addSet = (): void => {
    const inner: RuleGroup = {
      operator: rules.operator === "AND" ? "OR" : "AND",
      conditions: [{ field: "type", op: "eq", value: "movie" } as RuleCondition],
    };
    onChange({ ...rules, conditions: [...items, inner] });
  };

  return (
    <div className="space-y-4">
      {/* Header with operator toggle */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Route to this folder when</span>
        <OperatorToggle value={rules.operator} onChange={(op) => onChange({ ...rules, operator: op })} />
        <span className="text-muted-foreground">of these are true</span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i}>
            {"operator" in item ? (
              <ConditionSet
                group={item as RuleGroup}
                onChange={(g) => updateItem(i, g)}
                onRemove={() => removeItem(i)}
              />
            ) : (
              <ConditionEditor
                condition={item as RuleCondition}
                onChange={(c) => updateItem(i, c)}
                onRemove={() => removeItem(i)}
              />
            )}
            {i < items.length - 1 && <ConnectorLabel value={rules.operator} />}
          </div>
        ))}
      </div>

      {/* Add actions — always at the bottom */}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={addCondition} className="text-sm text-primary hover:text-primary/80 transition-colors font-medium">
          + Add condition
        </button>
        <button type="button" onClick={addSet} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          + Add set of conditions
        </button>
      </div>
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
  rules: RuleGroup | null;
  onSave: (rules: RuleGroup | null) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<RuleGroup>(rules ?? { operator: "AND", conditions: [] });

  useEffect(() => {
    if (open) setDraft(rules ?? { operator: "AND", conditions: [] });
  }, [open, rules]);

  const hasConditions = draft.conditions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Auto-routing Rules</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Define when Canto should automatically select this folder for a download.
          Add conditions based on media type, genre, country, language, or content rating.
        </p>
        <div className="pt-3">
          <RulesEditor rules={draft} onChange={setDraft} />
        </div>
        <div className="flex items-center justify-between pt-5 border-t border-border/30">
          <Button variant="ghost" className="text-muted-foreground rounded-xl" onClick={() => { onSave(null); onOpenChange(false); }}>
            Clear rules
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="rounded-xl" onClick={() => { onSave(hasConditions ? draft : null); onOpenChange(false); }}>
              Save rules
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Presets                                                                     */
/* -------------------------------------------------------------------------- */

type RuleTemplate = { label: string; rules: RuleGroup; qbitCategory: string; priority: number };

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    label: "Movies",
    rules: { operator: "AND", conditions: [{ field: "type", op: "eq", value: "movie" }] },
    qbitCategory: "movies",
    priority: 20,
  },
  {
    label: "Shows",
    rules: { operator: "AND", conditions: [{ field: "type", op: "eq", value: "show" }] },
    qbitCategory: "shows",
    priority: 10,
  },
  {
    label: "Anime",
    rules: {
      operator: "AND",
      conditions: [
        { field: "type", op: "eq", value: "show" },
        {
          operator: "OR",
          conditions: [
            { field: "originCountry", op: "contains_any", value: ["JP"] },
            { field: "genre", op: "contains_any", value: ["Animation"] },
          ],
        },
      ],
    },
    qbitCategory: "animes",
    priority: 0,
  },
  {
    label: "Documentaries",
    rules: { operator: "AND", conditions: [{ field: "genre", op: "contains_any", value: ["Documentary"] }] },
    qbitCategory: "documentaries",
    priority: 15,
  },
];

/* -------------------------------------------------------------------------- */
/*  Folder data type                                                           */
/* -------------------------------------------------------------------------- */

interface FolderData {
  id: string;
  name: string;
  downloadPath: string | null;
  libraryPath: string | null;
  qbitCategory: string | null;
  rules: RuleGroup | null;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Folder card                                                                */
/* -------------------------------------------------------------------------- */

const cardInputCn = "h-10 bg-accent rounded-xl border-none ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm";

/* -------------------------------------------------------------------------- */
/*  Combo input — free text with dropdown suggestions                          */
/* -------------------------------------------------------------------------- */

function ComboInput({
  value,
  onChange,
  placeholder,
  className,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  suggestions: Array<{ label: string; path: string }>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter(
    (s) => !value || s.path.toLowerCase().includes(value.toLowerCase()) || s.label.toLowerCase().includes(value.toLowerCase()),
  );
  const hasSuggestions = suggestions.length > 0;

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => { onChange(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={cn(className, hasSuggestions && "pr-10")}
          />
          {hasSuggestions && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setOpen(!open)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && filtered.length > 0 && "rotate-180")} />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground/50">Existing qBittorrent paths</p>
        {filtered.map((s) => {
          const isSelected = value === s.path;
          return (
            <button
              key={s.path}
              type="button"
              onClick={() => { onChange(s.path); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors text-left",
                isSelected ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-accent",
              )}
            >
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.path}</p>
                {s.label !== s.path && <p className="text-xs text-muted-foreground/50 truncate">{s.label}</p>}
              </div>
              {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
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
          <div className="border-b border-border/40 px-3 py-2.5">
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
              <p className="py-4 text-center text-sm text-muted-foreground/50">No subfolders</p>
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
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
                    title="Open folder"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          {/* Select current folder */}
          <div className="border-t border-border/40 p-2">
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
  qbitPaths,
}: {
  folder: FolderData;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  importMethod?: "local" | "remote";
  /** Available qBittorrent paths for download path dropdown (API mode only) */
  qbitPaths?: Array<{ label: string; path: string }>;
}): React.JSX.Element {
  const isLocal = importMethod === "local";
  const [name, setName] = useState(folder.name);
  const [dlPath, setDlPath] = useState(folder.downloadPath ?? "");
  const [libPath, setLibPath] = useState(folder.libraryPath ?? "");
  const [qbitCat, setQbitCat] = useState(folder.qbitCategory ?? "");
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    setName(folder.name);
    setDlPath(folder.downloadPath ?? "");
    setLibPath(folder.libraryPath ?? "");
    setQbitCat(folder.qbitCategory ?? "");
  }, [folder]);

  const dirty =
    name !== folder.name ||
    dlPath !== (folder.downloadPath ?? "") ||
    libPath !== (folder.libraryPath ?? "") ||
    qbitCat !== (folder.qbitCategory ?? "");

  const updateFolder = trpc.folder.update.useMutation({
    onSuccess: () => { toast.success("Saved"); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteFolder = trpc.folder.delete.useMutation({
    onSuccess: () => { toast.success("Folder deleted"); onRefresh(); },
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

  const handleSaveRules = (rules: RuleGroup | null): void => {
    updateFolder.mutate({ id: folder.id, rules });
  };

  const needsConfig = !folder.downloadPath || !folder.libraryPath;

  return (
    <>
      <div className={cn(
        "rounded-2xl border transition-colors overflow-hidden",
        needsConfig ? "border-amber-500/30 bg-amber-500/[0.02]" : "border-border/40",
      )}>
        {/* Collapsed header — always visible */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-muted/10 transition-colors"
        >
          <Folder className={cn("h-5 w-5 shrink-0", needsConfig ? "text-amber-500/60" : "text-primary")} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-semibold text-foreground">{folder.name}</p>
              {folder.qbitCategory && (
                <span className="text-sm text-muted-foreground">{folder.qbitCategory}</span>
              )}
              {folder.isDefault && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Fallback</span>
              )}
              {folder.rules && (
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">Auto-routing</span>
              )}
              {needsConfig && (
                <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">Needs paths</span>
              )}
              {!folder.enabled && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Disabled</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-5 mt-1.5">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
                <FolderDown className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                {folder.downloadPath || <span className="italic text-muted-foreground/40">No download path</span>}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                {folder.libraryPath || <span className="italic text-muted-foreground/40">{isLocal ? "No library path" : "No media path"}</span>}
              </span>
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300", expanded && "rotate-180")} />
        </button>

        {/* Expanded editor */}
        <AnimatedCollapse open={expanded}>
          <div className="border-t border-border/30 px-4 sm:px-5 py-5 space-y-4">
            {/* Name + category */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium text-foreground/80">Folder name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className={cn(cardInputCn, "font-semibold text-base")} />
              </div>
              <div className="sm:w-36 space-y-1.5">
                <label className="text-sm font-medium text-foreground/80">qBit category</label>
                <Input value={qbitCat} onChange={(e) => setQbitCat(e.target.value)} placeholder="e.g. movies" className={cardInputCn} />
              </div>
            </div>

            {/* Paths */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <FolderDown className="h-4 w-4 text-blue-400" />
                  Download path
                </label>
                <p className="text-sm text-muted-foreground -mt-0.5">
                  {isLocal
                    ? "Where your torrent client saves files while they download and seed."
                    : "Configured in qBittorrent — the save path for this category."}
                </p>
                {isLocal ? (
                  <PathInput value={dlPath} onChange={setDlPath} placeholder="/data/downloads/movies" className={cardInputCn} />
                ) : (
                  <ComboInput value={dlPath} onChange={setDlPath} placeholder="/downloads/movies" className={cardInputCn} suggestions={qbitPaths ?? []} />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <FolderOpen className="h-4 w-4 text-emerald-400" />
                  {isLocal ? "Library path" : "Media path"}
                </label>
                <p className="text-sm text-muted-foreground -mt-0.5">
                  {isLocal
                    ? "Where Canto organizes files after import — should match your media server library folder."
                    : "Where qBittorrent moves files after download. Your media server should scan this folder. Type a new path or pick an existing one."}
                </p>
                {isLocal ? (
                  <PathInput value={libPath} onChange={setLibPath} placeholder="/data/media/movies" className={cardInputCn} />
                ) : (
                  <ComboInput value={libPath} onChange={setLibPath} placeholder="/media/movies" className={cardInputCn} suggestions={qbitPaths ?? []} />
                )}
              </div>
            </div>

            {/* Auto-routing */}
            <div className="rounded-xl border border-border/30 bg-muted/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Auto-routing</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-lg gap-1.5 text-xs" onClick={() => setRulesOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit rules
                </Button>
              </div>
              {folder.rules ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Canto auto-selects this folder when: <span className="text-foreground/80">{describeGroup(folder.rules)}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">
                  No rules — this folder can only be selected manually when downloading.
                </p>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-border/20">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground/80">Fallback folder</p>
                  <p className="text-sm text-muted-foreground">Use this folder when no routing rules match a download.</p>
                </div>
                <Switch
                  checked={folder.isDefault}
                  onCheckedChange={(checked) => { if (checked) setDefault.mutate({ id: folder.id }); }}
                  disabled={folder.isDefault || setDefault.isPending}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => deleteFolder.mutate({ id: folder.id })} disabled={deleteFolder.isPending} className="text-sm text-muted-foreground/60 hover:text-destructive transition-colors flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Delete folder
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
/*  Custom folder dialog                                                       */
/* -------------------------------------------------------------------------- */

function CustomFolderDialog({
  open,
  onOpenChange,
  onCreated,
  basePath,
  importMethod = "local",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  basePath: string;
  importMethod?: "local" | "remote";
}): React.JSX.Element {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const isLocal = importMethod === "local";

  const createFolder = trpc.folder.create.useMutation({
    onSuccess: () => {
      toast.success("Folder created");
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
          <DialogTitle>New Download Folder</DialogTitle>
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
              <p className="text-sm text-foreground/80 font-mono">{root}/downloads/{slug}</p>
              <p className="text-sm text-foreground/80 font-mono">{root}/media/{slug}</p>
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

  const toggle = (path: string, name: string): void => {
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
          <DialogTitle>Import {pathType === "download" ? "download" : "library"} folders</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Browse to a directory and select folders to import. Each selected folder becomes a new download folder
          with its path set as the {pathType === "download" ? "download" : "library"} path.
        </p>

        <div className="space-y-3 pt-2">
          {/* Path browser */}
          <PathInput value={scanPath} onChange={setScanPath} placeholder="/" className="h-10 bg-accent rounded-xl border-none text-sm" />

          {/* Folder list with checkboxes */}
          <div className="rounded-xl border border-border/40 overflow-hidden">
            {data?.parent && data.parent !== data.path && (
              <button
                type="button"
                onClick={() => setScanPath(data.parent)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors border-b border-border/30"
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
                <p className="py-6 text-center text-sm text-muted-foreground/50">No subfolders found</p>
              ) : (
                data?.dirs.map((dir) => {
                  const isSelected = selected.has(dir.path);
                  return (
                    <div key={dir.path} className="flex items-center border-b border-border/20 last:border-0">
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
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border/60",
                        )}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{dir.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScanPath(dir.path)}
                        className="shrink-0 px-3 py-2.5 text-muted-foreground/40 hover:text-foreground transition-colors"
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
  const showBasePath = false;
  const [customOpen, setCustomOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPathType, setScanPathType] = useState<"download" | "library">("library");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: folders, isLoading } = trpc.folder.list.useQuery();
  const { data: qbitData } = trpc.folder.qbitCategories.useQuery(undefined, { enabled: effectiveMethod === "remote" });
  const seedFolders = trpc.folder.seed.useMutation({
    onSuccess: () => {
      toast.success("Default folders created");
      void utils.folder.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const createFolder = trpc.folder.create.useMutation({
    onSuccess: () => void utils.folder.list.invalidate(),
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
  const existingNames = new Set(allFolders.map((f) => f.name.toLowerCase()));

  // Build qBittorrent path options for API mode dropdown
  const qbitPaths = (() => {
    if (!qbitData) return [];
    const defaultPath = qbitData.defaultSavePath.replace(/\/+$/, "");
    const paths: Array<{ label: string; path: string }> = [];
    if (defaultPath) paths.push({ label: `${defaultPath} (default)`, path: defaultPath });
    for (const [catName, cat] of Object.entries(qbitData.categories)) {
      const p = cat.savePath || (defaultPath ? `${defaultPath}/${catName}` : "");
      if (p && !paths.some((x) => x.path === p)) {
        paths.push({ label: `${p} (${catName})`, path: p });
      }
    }
    return paths;
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

  const handleAddPreset = (template: RuleTemplate): void => {
    const root = basePath.replace(/\/+$/, "");
    createFolder.mutate({
      name: template.label,
      downloadPath: root ? `${root}/downloads/${template.qbitCategory}` : undefined,
      libraryPath: root ? `${root}/media/${template.qbitCategory}` : undefined,
      qbitCategory: template.qbitCategory,
      rules: template.rules,
      priority: template.priority,
    });
  };

  const handleImportFromQbit = (): void => {
    if (!qbitData) return;
    const existing = new Set(allFolders.map((f) => f.qbitCategory?.toLowerCase()));
    const defaultPath = qbitData.defaultSavePath.replace(/\/+$/, "");
    let count = 0;
    for (const [catName, cat] of Object.entries(qbitData.categories)) {
      if (existing.has(catName.toLowerCase())) continue;
      // Use category save path, or build from default + category name
      const dlPath = cat.savePath || (defaultPath ? `${defaultPath}/${catName}` : undefined);
      createFolder.mutate({
        name: catName.charAt(0).toUpperCase() + catName.slice(1),
        downloadPath: dlPath,
        qbitCategory: catName,
        priority: 10,
      });
      count++;
    }
    if (count > 0) toast.success(`Importing ${count} categories from qBittorrent`);
    else toast.info("No new categories found in qBittorrent");
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
        {showBasePath && (
          <div className="rounded-2xl border border-border/40 bg-muted/5 p-4 sm:p-5 space-y-3">
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
        <div className="flex flex-wrap gap-2">
          {effectiveMethod === "local" ? (
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => { setScanPathType("library"); setScanOpen(true); }}>
              <ScanSearch className="h-4 w-4" />
              Import from filesystem
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl gap-2" onClick={handleImportFromQbit} disabled={!qbitData || createFolder.isPending}>
              <Download className="h-4 w-4" />
              Import from qBittorrent
            </Button>
          )}
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => setCustomOpen(true)}>
            <Plus className="h-4 w-4" />
            Custom folder
          </Button>
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => seedFolders.mutate()} disabled={seedFolders.isPending}>
            {seedFolders.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Create suggested folders
          </Button>
        </div>

        <CustomFolderDialog open={customOpen} onOpenChange={setCustomOpen} onCreated={refresh} basePath={basePath} importMethod={effectiveMethod} />
        <ScanFoldersDialog open={scanOpen} onOpenChange={setScanOpen} onCreated={refresh} pathType={scanPathType} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Base path + generate — only when not provided externally */}
      {showBasePath && (
        <div className="rounded-2xl border border-border/40 bg-muted/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Base path</p>
            <span className="text-sm text-muted-foreground/60">
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
      <div className="flex flex-wrap gap-2">
        {effectiveMethod === "local" ? (
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => { setScanPathType("library"); setScanOpen(true); }}>
            <ScanSearch className="h-4 w-4" />
            Import from filesystem
          </Button>
        ) : (
          <Button variant="outline" className="rounded-xl gap-2" onClick={handleImportFromQbit} disabled={!qbitData || createFolder.isPending}>
            <Download className="h-4 w-4" />
            Import from qBittorrent
          </Button>
        )}
        <Button variant="outline" className="rounded-xl gap-2" onClick={() => setCustomOpen(true)}>
          <Plus className="h-4 w-4" />
          Custom folder
        </Button>
        <Button variant="outline" className="rounded-xl gap-2" onClick={() => seedFolders.mutate()} disabled={seedFolders.isPending}>
          {seedFolders.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Create suggested folders
        </Button>
      </div>

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
            qbitPaths={qbitPaths}
          />
        ))}
      </div>

      <CustomFolderDialog open={customOpen} onOpenChange={setCustomOpen} onCreated={refresh} basePath={basePath} importMethod={effectiveMethod} />
      <ScanFoldersDialog open={scanOpen} onOpenChange={setScanOpen} onCreated={refresh} pathType={scanPathType} />
    </div>
  );
}
