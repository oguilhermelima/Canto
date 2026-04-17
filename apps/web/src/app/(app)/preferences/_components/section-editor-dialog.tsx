"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Slider } from "@canto/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { Bookmark, Check, ChevronLeft, ChevronRight, Eye, Server, X } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import type { HomeSectionConfig } from "@canto/db/schema";
import { TabBar } from "@canto/ui/tab-bar";
import { BackdropCard } from "~/components/media/backdrop-card";
import { MediaCard } from "~/components/media/media-card";

/* ─── Types ─── */

interface SectionDraft {
  id?: string;
  position: number;
  title: string;
  style: string;
  sourceType: string;
  sourceKey: string;
  config: HomeSectionConfig;
  enabled: boolean;
}

interface SectionEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SectionDraft | null;
  onSave: (section: SectionDraft) => void;
}

type ActiveTab = "library" | "collections" | "tmdb";

/* ─── TMDB condition types ─── */

interface TmdbCondition {
  field: string;
  op: string;
  value: unknown;
}

/* ─── Constants ─── */

const STYLE_OPTIONS = [
  { value: "spotlight", label: "Spotlight", description: "Full-screen hero" },
  { value: "large_video", label: "Large Video", description: "Expandable with trailer" },
  { value: "card", label: "Card", description: "Backdrop cards" },
  { value: "cover", label: "Cover", description: "Poster cards" },
];

const DB_SOURCE_OPTIONS = [
  { value: "spotlight", label: "Spotlight", description: "Featured trending items" },
  { value: "recommendations", label: "Recommendations", description: "Personalized suggestions" },
  { value: "continue_watching", label: "Continue Watching", description: "In-progress media" },
  { value: "watch_next", label: "Watch Next", description: "Next episodes to watch" },
  { value: "recently_added", label: "Recently Added", description: "Latest library additions" },
];

const TMDB_SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "popularity.desc", label: "Popularity" },
  { value: "vote_average.desc", label: "Rating" },
  { value: "primary_release_date.desc", label: "Release Date (newest)" },
  { value: "primary_release_date.asc", label: "Release Date (oldest)" },
  { value: "title.asc", label: "Name A-Z" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
];

const TMDB_FIELD_OPTIONS = [
  { value: "type", label: "Media type" },
  { value: "sortBy", label: "Sort by" },
  { value: "genre", label: "Genre" },
  { value: "language", label: "Language" },
  { value: "scoreMin", label: "Score" },
  { value: "yearRange", label: "Year" },
] as const;

const TMDB_OPS_BY_FIELD: Record<string, Array<{ value: string; label: string }>> = {
  type: [{ value: "is", label: "is" }],
  sortBy: [{ value: "is", label: "is" }],
  genre: [
    { value: "includes", label: "includes" },
    { value: "excludes", label: "excludes" },
  ],
  language: [{ value: "is", label: "is" }],
  scoreMin: [{ value: "at_least", label: "at least" }],
  yearRange: [{ value: "between", label: "between" }],
};

/** Fields that can only appear once in the condition list. */
const UNIQUE_FIELDS = new Set(["type", "sortBy", "language", "scoreMin", "yearRange"]);

const inputCn =
  "h-10 bg-accent rounded-xl border-none ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm";

/* ─── TMDB condition helpers ─── */

function defaultCondition(field: string): TmdbCondition {
  switch (field) {
    case "type":
      return { field, op: "is", value: "movie" };
    case "sortBy":
      return { field, op: "is", value: "trending" };
    case "genre":
      return { field, op: "includes", value: [] as number[] };
    case "language":
      return { field, op: "is", value: "en" };
    case "scoreMin":
      return { field, op: "at_least", value: 5 };
    case "yearRange":
      return { field, op: "between", value: { from: "", to: "" } };
    default:
      return { field, op: "is", value: "" };
  }
}

function initConditions(cfg: Record<string, unknown>): TmdbCondition[] {
  const conds: TmdbCondition[] = [];
  if (cfg.type) conds.push({ field: "type", op: "is", value: String(cfg.type) });
  if (cfg.mode === "trending") {
    conds.push({ field: "sortBy", op: "is", value: "trending" });
  } else if (cfg.sortBy) {
    conds.push({ field: "sortBy", op: "is", value: String(cfg.sortBy) });
  } else if (cfg.mode === "discover") {
    conds.push({ field: "sortBy", op: "is", value: "popularity.desc" });
  }
  if (cfg.genres) {
    conds.push({
      field: "genre",
      op: "includes",
      value: String(cfg.genres).split(",").map(Number).filter(Boolean),
    });
  }
  if (cfg.language) conds.push({ field: "language", op: "is", value: String(cfg.language) });
  if (Number(cfg.scoreMin) > 0) conds.push({ field: "scoreMin", op: "at_least", value: Number(cfg.scoreMin) });
  if (cfg.dateFrom || cfg.dateTo) {
    conds.push({
      field: "yearRange",
      op: "between",
      value: { from: String(cfg.dateFrom || ""), to: String(cfg.dateTo || "") },
    });
  }
  return conds;
}

function buildTmdbConfig(conditions: TmdbCondition[]): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  let hasType = false;
  let hasSort = false;

  for (const c of conditions) {
    switch (c.field) {
      case "type":
        config.type = c.value as string;
        hasType = true;
        break;
      case "sortBy":
        if (c.value === "trending") {
          config.mode = "trending";
        } else {
          config.mode = "discover";
          config.sortBy = c.value as string;
        }
        hasSort = true;
        break;
      case "genre": {
        const ids = c.value as number[];
        if (ids.length > 0) config.genres = ids.join(",");
        break;
      }
      case "language":
        if (c.value) config.language = c.value as string;
        break;
      case "scoreMin":
        if (Number(c.value) > 0) config.scoreMin = Number(c.value);
        break;
      case "yearRange": {
        const range = c.value as { from: string; to: string };
        if (range.from) config.dateFrom = range.from;
        if (range.to) config.dateTo = range.to;
        break;
      }
    }
  }

  if (!hasType) config.type = "movie";
  if (!hasSort) config.mode = "trending";
  return config;
}

function deriveActiveTab(section: SectionDraft | null): ActiveTab {
  if (!section) return "library";
  if (section.sourceType === "tmdb") return "tmdb";
  if (section.sourceKey === "collection") return "collections";
  return "library";
}

/* ─── ChipSelect (multi-select popover — matches auto-routing) ─── */

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
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {options.find((o) => o.value === v)?.label ?? v}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggle(v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggle(v); } }}
                    className="cursor-pointer transition-colors hover:text-destructive"
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
          onWheel={(e) => { e.stopPropagation(); e.currentTarget.scrollTop += e.deltaY; }}
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

/* ─── TMDB ConditionEditor (mirrors auto-routing ConditionEditor) ─── */

function TmdbConditionEditor({
  condition,
  onChange,
  onRemove,
  genreOptions,
  fieldOptions,
}: {
  condition: TmdbCondition;
  onChange: (c: TmdbCondition) => void;
  onRemove: () => void;
  genreOptions: Array<{ value: string; label: string }>;
  fieldOptions: Array<{ value: string; label: string }>;
}): React.JSX.Element {
  const ops = TMDB_OPS_BY_FIELD[condition.field] ?? [];

  const handleFieldChange = (field: string): void => {
    onChange(defaultCondition(field));
  };

  return (
    <>
      <div className="flex items-start gap-2">
        {/* Field selector */}
        <Select value={condition.field} onValueChange={handleFieldChange}>
          <SelectTrigger className={cn(inputCn, "w-[140px] shrink-0")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldOptions.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operator */}
        {ops.length > 1 ? (
          <Select value={condition.op} onValueChange={(op) => onChange({ ...condition, op })}>
            <SelectTrigger className={cn(inputCn, "w-[120px] shrink-0")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ops.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex h-10 shrink-0 items-center px-2 text-sm text-muted-foreground">
            {ops[0]?.label ?? "is"}
          </span>
        )}

        {/* Value */}
        <div className="min-w-0 flex-1">
          {condition.field === "type" ? (
            <Select value={String(condition.value)} onValueChange={(v) => onChange({ ...condition, value: v })}>
              <SelectTrigger className={cn(inputCn, "w-full")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="movie">Movie</SelectItem>
                <SelectItem value="show">Show</SelectItem>
              </SelectContent>
            </Select>
          ) : condition.field === "sortBy" ? (
            <Select value={String(condition.value)} onValueChange={(v) => onChange({ ...condition, value: v })}>
              <SelectTrigger className={cn(inputCn, "w-full")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {TMDB_SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : condition.field === "genre" ? (
            <ChipSelect
              value={(condition.value as number[]).map(String)}
              onChange={(values) => onChange({ ...condition, value: values.map(Number) })}
              options={genreOptions}
              placeholder="Select genres..."
            />
          ) : condition.field === "language" ? (
            <Select value={String(condition.value) || "en"} onValueChange={(v) => onChange({ ...condition, value: v })}>
              <SelectTrigger className={cn(inputCn, "w-full")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : condition.field === "scoreMin" ? (
            <div className="flex items-center gap-3 pr-1">
              <Slider
                value={[Number(condition.value) || 0]}
                onValueChange={(v) => onChange({ ...condition, value: v[0] ?? 0 })}
                min={0} max={10} step={0.5}
                className="flex-1"
              />
              <span className="w-6 text-right text-sm text-muted-foreground">{Number(condition.value) || 0}</span>
            </div>
          ) : condition.field === "yearRange" ? (
            <div className="flex items-center gap-2">
              <Input
                type="number" placeholder="From" min={1900} max={2030}
                value={(condition.value as { from: string; to: string }).from}
                onChange={(e) => onChange({ ...condition, value: { ...(condition.value as { from: string; to: string }), from: e.target.value } })}
                className={inputCn}
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="number" placeholder="To" min={1900} max={2030}
                value={(condition.value as { from: string; to: string }).to}
                onChange={(e) => onChange({ ...condition, value: { ...(condition.value as { from: string; to: string }), to: e.target.value } })}
                className={inputCn}
              />
            </div>
          ) : null}
        </div>

        {/* Remove */}
        <button type="button" onClick={onRemove} className="mt-0.5 shrink-0 rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Inline hints */}
      {condition.field === "genre" && (
        <p className="pl-[152px] pt-0.5 text-sm text-muted-foreground">
          {condition.op === "excludes"
            ? "Exclude media with any of these genres."
            : "Include media with any of these genres."}
        </p>
      )}
    </>
  );
}

/* ─── AND connector (mirrors auto-routing ConnectorLabel) ─── */

function ConnectorLabel(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1 pl-3">
      <span className="text-xs font-bold uppercase tracking-wider text-blue-400/50">and</span>
      <div className="h-px flex-1 bg-border/20" />
    </div>
  );
}

/* ─── Collection poster stack (compact, mirrors collections-tab ListPreviewStack) ─── */

function posterSrc(path: string): string {
  return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w185${path}`;
}

function CollectionPreviewStack({ posters, type }: { posters: string[]; type: string }): React.JSX.Element {
  const preview = posters.slice(0, 3);
  const Icon = type === "watchlist" ? Eye : type === "server" ? Server : Bookmark;
  return (
    <div className="relative h-[56px] w-[70px] shrink-0">
      {Array.from({ length: 3 }).map((_, index) => {
        const poster = preview[index];
        return (
          <div
            key={`${poster ?? "empty"}-${index}`}
            className="absolute top-0 h-[56px] w-[36px] overflow-hidden rounded-md border border-background/40 bg-background/70 shadow-sm"
            style={{ left: `${index * 14}px`, zIndex: index + 1 }}
          >
            {poster ? (
              <img src={posterSrc(poster)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Icon className="h-3 w-3" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Style Preview ─── */

function useExamplePaths(): { backdrop: string; poster: string; logo: string } {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    backdrop: `${origin}/backdrop-example.webp`,
    poster: `${origin}/poster-example.webp`,
    logo: `${origin}/logo-example.webp`,
  };
}

function StylePreview({ value }: { value: string }): React.JSX.Element {
  const example = useExamplePaths();

  if (value === "spotlight") {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl">
        <img src="/backdrop-example.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black from-5% via-black/40 via-35% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5">
          <img src="/logo-example.webp" alt="Il Sorpasso" className="h-8 w-auto self-start drop-shadow-lg sm:h-10" />
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground">
            <span>Movie</span><span className="text-foreground">|</span>
            <span className="text-yellow-400">8.0</span><span className="text-foreground">|</span>
            <span>1962</span><span className="text-foreground">|</span>
            <span>Comedy</span><span className="text-foreground">·</span><span>Drama</span>
          </div>
          <p className="line-clamp-2 max-w-md text-xs leading-relaxed text-foreground">
            Roberto, a restless Italian playboy, picks up shy law student Bruno for an impromptu road trip through the Italian countryside.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex h-8 items-center rounded-xl bg-white px-4"><span className="text-xs font-semibold text-black">+ Watchlist</span></div>
            <div className="flex h-8 items-center gap-1.5 rounded-xl bg-foreground/15 px-4"><span className="text-xs font-medium text-foreground">More Info</span></div>
          </div>
        </div>
      </div>
    );
  }

  if (value === "large_video") {
    return (
      <div className="flex w-full justify-center overflow-hidden rounded-xl bg-black py-4">
        <div className="group/card relative h-72 w-44 shrink-0 overflow-hidden rounded-xl transition-[width] duration-300 ease-in-out hover:w-full hover:border hover:border-border">
          <div className="absolute inset-0 transition-opacity duration-300 group-hover/card:pointer-events-none group-hover/card:opacity-0">
            <img src="/poster-example.webp" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
            <iframe
              src="https://www.youtube-nocookie.com/embed/X5Tjj5B7Kbc?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=X5Tjj5B7Kbc&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0"
              className="pointer-events-none absolute -inset-[60px] h-[calc(100%+120px)] w-[calc(100%+120px)] border-0"
              allow="autoplay; encrypted-media" title="Il Sorpasso trailer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5">
              <img src="/logo-example.webp" alt="Il Sorpasso" className="h-6 w-auto self-start drop-shadow-lg" />
              <div className="flex items-center gap-2 text-sm text-white/70">
                <span>Movie</span><span className="text-white/30">·</span>
                <span className="text-yellow-400">8.0</span><span className="text-white/30">·</span><span>1962</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (value === "card") {
    return (
      <div className="pointer-events-none">
        <BackdropCard externalId="24188" provider="tmdb" type="movie" title="Il Sorpasso"
          backdropPath={example.backdrop} logoPath={null} year={1962} voteAverage={8.0} className="w-full" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none flex justify-center">
      <MediaCard externalId="24188" provider="tmdb" type="movie" title="Il Sorpasso"
        posterPath={example.poster} year={1962} voteAverage={8.0} showTitle={false} className="w-full max-w-[280px]" />
    </div>
  );
}

/* ─── Component ─── */

export function SectionEditorDialog({
  open,
  onOpenChange,
  section,
  onSave,
}: SectionEditorDialogProps): React.JSX.Element {
  const isNew = !section?.id;
  const [step, setStep] = useState(0);

  const [title, setTitle] = useState(section?.title ?? "");
  const [style, setStyle] = useState(section?.style ?? "card");
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => deriveActiveTab(section));
  const [dbSourceKey, setDbSourceKey] = useState(section?.sourceKey ?? "recommendations");

  // Collection state
  const cfg = (section?.config ?? {}) as Record<string, unknown>;
  const [selectedListId, setSelectedListId] = useState(() => String(cfg.listId || ""));

  // TMDB conditions
  const [conditions, setConditions] = useState<TmdbCondition[]>(() => initConditions(cfg));

  // Reset state when dialog opens
  const resetToSection = useCallback((s: SectionDraft | null) => {
    const c = (s?.config ?? {}) as Record<string, unknown>;
    setTitle(s?.title ?? "");
    setStyle(s?.style ?? "card");
    setActiveTab(deriveActiveTab(s));
    setDbSourceKey(s?.sourceKey ?? "recommendations");
    setSelectedListId(String(c.listId || ""));
    setConditions(initConditions(c));
  }, []);

  useEffect(() => {
    if (open) { resetToSection(section); setStep(0); }
  }, [open, section, resetToSection]);

  // Genres from TMDB — guess type from conditions
  const tmdbType = (conditions.find((c) => c.field === "type")?.value as string) || "movie";
  const { data: genreList } = trpc.provider.genres.useQuery(
    { type: tmdbType as "movie" | "show" },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );
  const genreOptions = (genreList ?? []).map((g) => ({ value: String(g.id), label: g.name }));

  // User collections
  const { data: userLists, isLoading: listsLoading } = trpc.list.getAll.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const collections = (userLists ?? []).filter((l) => l.type === "watchlist" || l.type === "custom");

  // Condition management — enforce unique fields
  const usedFields = new Set(conditions.map((c) => c.field));

  const addCondition = useCallback(() => {
    const next = TMDB_FIELD_OPTIONS.find(
      (f) => !UNIQUE_FIELDS.has(f.value) || !usedFields.has(f.value),
    );
    if (next) setConditions((prev) => [...prev, defaultCondition(next.value)]);
  }, [usedFields]);

  const canAddCondition = TMDB_FIELD_OPTIONS.some(
    (f) => !UNIQUE_FIELDS.has(f.value) || !usedFields.has(f.value),
  );

  /** Field options visible for a given condition (current field always available). */
  const fieldOptionsFor = useCallback(
    (currentField: string) =>
      TMDB_FIELD_OPTIONS.filter(
        (f) =>
          f.value === currentField ||
          !UNIQUE_FIELDS.has(f.value) ||
          !usedFields.has(f.value),
      ),
    [usedFields],
  );

  const updateCondition = useCallback((idx: number, c: TmdbCondition) => {
    setConditions((prev) => { const n = [...prev]; n[idx] = c; return n; });
  }, []);

  const removeCondition = useCallback((idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = useCallback(() => {
    let finalSourceType: string;
    let finalSourceKey: string;
    let config: HomeSectionConfig;

    if (activeTab === "library") {
      finalSourceType = "db";
      finalSourceKey = dbSourceKey;
      config = {} as HomeSectionConfig;
    } else if (activeTab === "collections") {
      finalSourceType = "db";
      finalSourceKey = "collection";
      config = { listId: selectedListId } as HomeSectionConfig;
    } else {
      const tmdbConfig = buildTmdbConfig(conditions);
      finalSourceType = "tmdb";
      finalSourceKey = String(tmdbConfig.mode || "trending");
      config = tmdbConfig as HomeSectionConfig;
    }

    onSave({
      id: section?.id,
      position: section?.position ?? 0,
      title: title.trim() || "Untitled Section",
      style,
      sourceType: finalSourceType,
      sourceKey: finalSourceKey,
      config,
      enabled: section?.enabled ?? true,
    });
    onOpenChange(false);
  }, [section, title, style, activeTab, dbSourceKey, selectedListId, conditions, onSave, onOpenChange]);

  const selectCollection = useCallback(
    (listId: string, listName: string) => {
      setSelectedListId(listId);
      if (!title || DB_SOURCE_OPTIONS.some((o) => o.label === title)) setTitle(listName);
    },
    [title],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh max-w-2xl flex-col gap-0 overflow-hidden p-0 max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-h-[85vh]">
        <DialogHeader bar>
          <DialogTitle>{isNew ? "Add Section" : "Edit Section"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 ? (
            <div className="flex flex-col gap-6">
              {/* Title */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">Title</label>
                <Input variant="ghost" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section title" />
              </div>

              {/* Data Source */}
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-foreground">Data Source</label>

                <TabBar
                  tabs={[
                    { value: "library", label: "Library" },
                    { value: "collections", label: "Collections" },
                    { value: "tmdb", label: "TMDB" },
                  ]}
                  value={activeTab}
                  onChange={(v) => setActiveTab(v as ActiveTab)}
                  className="mb-0 py-0"
                />

                {/* ── Library ── */}
                {activeTab === "library" && (
                  <div className="space-y-2">
                    {DB_SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDbSourceKey(opt.value)}
                        className={cn(
                          "flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition-colors",
                          dbSourceKey === opt.value
                            ? "border-foreground bg-accent"
                            : "border-border bg-muted/20 hover:bg-accent/50",
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Collections ── */}
                {activeTab === "collections" && (
                  <div className="space-y-2">
                    {listsLoading && (
                      <>
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </>
                    )}

                    {!listsLoading && collections.length === 0 && (
                      <div className="rounded-2xl border border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                        No collections yet
                      </div>
                    )}

                    {collections.map((list) => (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => selectCollection(list.id, list.name)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                          selectedListId === list.id
                            ? "border-foreground bg-accent"
                            : "border-border bg-muted/20 hover:bg-accent/50",
                        )}
                      >
                        <CollectionPreviewStack posters={list.previewPosters} type={list.type} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{list.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── TMDB (condition builder only) ── */}
                {activeTab === "tmdb" && (
                  <div className="space-y-2">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Add conditions based on media type, genre, language, score, or year.
                    </p>

                    {conditions.map((c, i) => (
                      <div key={i}>
                        {i > 0 && <ConnectorLabel />}
                        <TmdbConditionEditor
                          condition={c}
                          onChange={(updated) => updateCondition(i, updated)}
                          onRemove={() => removeCondition(i)}
                          genreOptions={genreOptions}
                          fieldOptions={fieldOptionsFor(c.field) as Array<{ value: string; label: string }>}
                        />
                      </div>
                    ))}

                    {canAddCondition && (
                      <button
                        type="button"
                        onClick={addCondition}
                        className="text-sm font-medium text-primary transition-colors hover:text-primary"
                      >
                        + Add condition
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Step 2: Style ── */
            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium text-foreground">Select the section format</label>
              {STYLE_OPTIONS.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStyle(value)}
                  className={cn(
                    "relative flex flex-col gap-3 overflow-hidden rounded-xl p-3 text-left transition-all",
                    style === value ? "bg-accent ring-1 ring-foreground" : "bg-accent/40 hover:bg-accent/70",
                  )}
                >
                  {style === value && (
                    <div className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-foreground">
                      <Check className="h-3.5 w-3.5 text-background" />
                    </div>
                  )}
                  <StylePreview value={value} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(0)} className="rounded-xl">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
            )}
            {step === 0 ? (
              <Button onClick={() => setStep(1)} className="rounded-xl">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={!title.trim()} className="rounded-xl">
                {isNew ? "Add" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
