"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import { Slider } from "@canto/ui/slider";
import { ChevronDown, ArrowDown, ArrowUp, RotateCcw, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWatchRegion } from "@/hooks/use-watch-region";
import type { FilterPreset } from "@/components/layout/browse-layout.types";

/* ─── Output Type ─── */

export interface FilterOutput {
  // Free text search (title ILIKE)
  q?: string;
  // TMDB discover params
  genres?: string;
  genreMode?: "and" | "or";
  language?: string;
  sortBy?: string;
  scoreMin?: number;
  scoreMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  yearMin?: string;
  yearMax?: string;
  certification?: string;
  status?: string;
  watchProviders?: string;
  watchRegion?: string;
  // DB filtering (lists / recommendations)
  genreIds?: number[];
  // Library filtering
  source?: "jellyfin" | "plex" | "manual";
  watchStatus?: "in_progress" | "completed" | "not_started";
  /** ISO datetime — inclusive lower bound for history watched-at filter. */
  watchedFrom?: string;
  /** ISO datetime — inclusive upper bound for history watched-at filter. */
  watchedTo?: string;
  // Collection-scoped: aggregate of list members' (+ owner) ratings
  membersRatingMin?: number;
  // Collection-scoped multi-select watch status (planned/watching/completed/dropped/none)
  watchStatuses?: string[];
}

/* ─── Constants ─── */

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Popularity" },
  { value: "vote_average.desc", label: "Rating" },
  { value: "primary_release_date.desc", label: "Release Date" },
  { value: "title.asc", label: "Name A-Z" },
  { value: "title.desc", label: "Name Z-A" },
];

const MEMBERS_RATING_SORT_OPTIONS = [
  { value: "members_rating.desc", label: "Members Rating (High)" },
  { value: "members_rating.asc", label: "Members Rating (Low)" },
];

const COLLECTION_SORT_OPTIONS = [
  { value: "date_added.desc", label: "Date Added (Newest)" },
  { value: "date_added.asc", label: "Date Added (Oldest)" },
];

const COLLECTION_WATCH_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
  { value: "none", label: "Not Tracked" },
] as const;

const LANGUAGES = [
  { value: "", label: "All Languages" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "zh", label: "Chinese" },
];

const TV_STATUS = [
  { value: "0", label: "Returning" },
  { value: "1", label: "Planned" },
  { value: "2", label: "In Production" },
  { value: "3", label: "Ended" },
  { value: "4", label: "Cancelled" },
  { value: "5", label: "Pilot" },
];


/* ─── Library preset constants ─── */

const LIBRARY_SORT_OPTIONS = [
  { value: "recently_watched", label: "Recently Watched" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "year_desc", label: "Year (New → Old)" },
  { value: "year_asc", label: "Year (Old → New)" },
];

const SOURCE_OPTIONS = [
  { value: "jellyfin", label: "Jellyfin" },
  { value: "plex", label: "Plex" },
  { value: "manual", label: "Manual" },
] as const;

const WATCH_STATUS_OPTIONS = [
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "not_started", label: "Not Started" },
] as const;

export type SectionId = "search" | "sort" | "genres" | "year" | "score" | "runtime" | "language" | "status" | "certification" | "watchProviders" | "source" | "watchStatus" | "membersRating";

/** URL param keys owned by FilterSidebar — everything else is preserved. */
const FILTER_KEYS = ["q", "genre", "genreMode", "sort", "language", "score", "scoreMode", "yearMin", "yearMax", "runtimeMin", "runtimeMax", "certification", "status", "providers", "providerMode", "source", "watchStatus", "watchStatuses", "memRating"] as const;

/* ─── Sub-components ─── */

function Section({
  label,
  defaultOpen = false,
  trailing,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        className="flex w-full cursor-pointer items-center justify-between"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
      >
        <span className="text-[15px] font-semibold text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {trailing && (
            <div onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </div>
      </div>
      {open && <div className="pt-4">{children}</div>}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function GroupHeader({ label, first = false }: { label: string; first?: boolean }): React.JSX.Element {
  return (
    <div className={cn("flex items-center gap-3", first ? "pb-3 pt-2" : "pb-3 pt-8")}>
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/70">
        {label}
      </span>
      <div className="h-[2px] flex-1 rounded-full bg-border" />
    </div>
  );
}

/* ─── Main Component ─── */

export interface FilterSidebarHandle {
  reset: () => void;
}

interface FilterSidebarProps {
  mediaType: "movie" | "show" | "all";
  onFilterChange: (filters: FilterOutput) => void;
  hideSections?: SectionId[];
  preset?: FilterPreset;
  hideHeader?: boolean;
  className?: string;
  resetRef?: React.MutableRefObject<FilterSidebarHandle | null>;
  /** Expose Members Rating filter + sort (collection detail only) */
  showMembersRating?: boolean;
  /** Initial sort value when no `?sort=` URL param is present.
   *  Used by the collection page to honour the list's `defaultSortBy`. */
  defaultSort?: string;
}

export function FilterSidebar({
  mediaType,
  onFilterChange,
  hideSections = [],
  preset = "tmdb",
  hideHeader = false,
  className,
  resetRef,
  showMembersRating = false,
  defaultSort,
}: FilterSidebarProps): React.JSX.Element {
  const isLibrary = preset === "library";
  const show = (id: SectionId): boolean => !hideSections.includes(id);

  // Genres from TMDB — cached forever
  const genreType = mediaType === "all" ? "movie" : mediaType;
  const { data: movieGenres } = trpc.provider.genres.useQuery(
    { type: "movie" },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );
  const { data: tvGenres } = trpc.provider.genres.useQuery(
    { type: "show" },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );

  const genreList = mediaType === "movie"
      ? movieGenres
      : mediaType === "show"
        ? tvGenres
        : (() => {
            // Merge movie + tv, dedupe by id
            const all = [...(movieGenres ?? []), ...(tvGenres ?? [])];
            const seen = new Set<number>();
            return all.filter((g) => {
              if (seen.has(g.id)) return false;
              seen.add(g.id);
              return true;
            });
          })();

  // ── URL ↔ State sync ──────────────────────────────────────────────
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Filter-owned param keys (everything else in the URL is preserved)

  const parseSet = (v: string | null): Set<number> =>
    new Set(v ? v.split(",").map(Number).filter(Boolean) : []);

  // Local state — seeded from URL params
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  // Keep `q` synced with the URL when it's updated externally (e.g. the
  // /search page's own debounced input). Without this, our URL-sync effect
  // below would re-emit the stale local value (often "") and clobber the
  // search page's update — which manifested as the input clearing itself
  // after the user stopped typing.
  const urlQ = searchParams.get("q") ?? "";
  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);
  const [selectedGenres, setSelectedGenres] = useState<Set<number>>(() => parseSet(searchParams.get("genre")));
  const [genreMode, setGenreMode] = useState<"and" | "or">((searchParams.get("genreMode") ?? "or") as "and" | "or");
  const fallbackSort = defaultSort ?? (isLibrary ? "recently_watched" : "popularity.desc");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") ?? fallbackSort);
  const [language, setLanguage] = useState(searchParams.get("language") ?? "");
  const [scoreMode, setScoreMode] = useState<"higher" | "lower">((searchParams.get("scoreMode") ?? "higher") as "higher" | "lower");
  const [scoreMin, setScoreMin] = useState(searchParams.get("score") ? Number(searchParams.get("score")) : 0);
  const [scoreDisplay, setScoreDisplay] = useState(searchParams.get("score") ? Number(searchParams.get("score")) : 0);
  const [yearMin, setYearMin] = useState(searchParams.get("yearMin") ?? "");
  const [yearMax, setYearMax] = useState(searchParams.get("yearMax") ?? "");
  const [runtimeMin, setRuntimeMin] = useState(searchParams.get("runtimeMin") ?? "");
  const [runtimeMax, setRuntimeMax] = useState(searchParams.get("runtimeMax") ?? "");
  const [certification, setCertification] = useState(searchParams.get("certification") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [selectedProviders, setSelectedProviders] = useState<Set<number>>(() => parseSet(searchParams.get("providers")));
  const [providerMode, setProviderMode] = useState<"and" | "or">((searchParams.get("providerMode") ?? "or") as "and" | "or");
  const { region: watchRegion } = useWatchRegion();

  // Library-specific state
  const [source, setSource] = useState<"jellyfin" | "plex" | "manual" | "">((searchParams.get("source") ?? "") as "jellyfin" | "plex" | "manual" | "");
  const [watchStatus, setWatchStatus] = useState<"in_progress" | "completed" | "not_started" | "">((searchParams.get("watchStatus") ?? "") as "in_progress" | "completed" | "not_started" | "");
  // Collection-specific multi-select watch statuses
  const [watchStatuses, setWatchStatuses] = useState<Set<string>>(() => {
    const raw = searchParams.get("watchStatuses");
    return new Set(raw ? raw.split(",").filter(Boolean) : []);
  });

  // Collection-specific state (members rating aggregate)
  const [membersRatingMin, setMembersRatingMin] = useState(() => {
    const raw = searchParams.get("memRating");
    return raw ? Number(raw) : 0;
  });
  const [membersRatingDisplay, setMembersRatingDisplay] = useState(membersRatingMin);

  // Watch providers for the region
  const { data: watchProvidersList } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: genreType, region: watchRegion },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );

  // Build FilterOutput from current state
  const buildOutput = useCallback((): FilterOutput => {
    const f: FilterOutput = {};
    const trimmedQ = q.trim();
    if (trimmedQ) f.q = trimmedQ;
    if (selectedGenres.size > 0) {
      const ids = [...selectedGenres];
      f.genres = ids.join(genreMode === "or" ? "|" : ",");
      f.genreMode = genreMode;
      f.genreIds = ids;
    }
    if (sortBy !== "popularity.desc") f.sortBy = sortBy;
    if (language) f.language = language;
    if (scoreMin > 0) {
      if (scoreMode === "higher") f.scoreMin = scoreMin;
      else f.scoreMax = scoreMin;
    }
    if (yearMin) f.yearMin = yearMin;
    if (yearMax) f.yearMax = yearMax;
    if (runtimeMin) f.runtimeMin = Number(runtimeMin);
    if (runtimeMax) f.runtimeMax = Number(runtimeMax);
    if (certification) {
      f.certification = certification;
      f.watchRegion = watchRegion;
    }
    if (status) f.status = status;
    if (selectedProviders.size > 0) {
      f.watchProviders = [...selectedProviders].join(providerMode === "or" ? "|" : ",");
      f.watchRegion = watchRegion;
    }
    // Library-specific fields
    if (source) f.source = source as "jellyfin" | "plex" | "manual";
    if (watchStatus) f.watchStatus = watchStatus as "in_progress" | "completed" | "not_started";
    // Collection-specific fields
    if (membersRatingMin > 0) f.membersRatingMin = membersRatingMin;
    if (watchStatuses.size > 0) f.watchStatuses = [...watchStatuses];
    return f;
  }, [q, selectedGenres, genreMode, sortBy, language, scoreMode, scoreMin, yearMin, yearMax, runtimeMin, runtimeMax, certification, status, selectedProviders, providerMode, watchRegion, source, watchStatus, membersRatingMin, watchStatuses]);

  // Sync state → URL + emit to parent
  const emitRef = useRef<ReturnType<typeof setTimeout>>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const trimmedQ = q.trim();
    const hasParams = !!trimmedQ || selectedGenres.size > 0 || language || sortBy !== fallbackSort || yearMin || yearMax || scoreMin > 0 || scoreMode !== "higher" || runtimeMin || runtimeMax || certification || status || selectedProviders.size > 0 || source || watchStatus || watchStatuses.size > 0 || membersRatingMin > 0;

    if (firstRender.current) {
      firstRender.current = false;
      // On mount, emit if URL had filter params
      if (hasParams) onFilterChange(buildOutput());
      return;
    }

    if (emitRef.current) clearTimeout(emitRef.current);
    emitRef.current = setTimeout(() => {
      // 1. Emit to parent
      onFilterChange(buildOutput());

      // 2. Update URL — preserve non-filter params
      const params = new URLSearchParams();
      for (const [key, value] of searchParams.entries()) {
        if (!(FILTER_KEYS as readonly string[]).includes(key)) {
          params.set(key, value);
        }
      }

      // Set filter params
      if (trimmedQ) params.set("q", trimmedQ);
      if (selectedGenres.size > 0) params.set("genre", [...selectedGenres].join(","));
      if (genreMode !== "or") params.set("genreMode", genreMode);
      if (sortBy !== fallbackSort) params.set("sort", sortBy);
      if (language) params.set("language", language);
      if (scoreMin > 0) params.set("score", String(scoreMin));
      if (scoreMode !== "higher") params.set("scoreMode", scoreMode);
      if (yearMin) params.set("yearMin", yearMin);
      if (yearMax) params.set("yearMax", yearMax);
      if (runtimeMin) params.set("runtimeMin", runtimeMin);
      if (runtimeMax) params.set("runtimeMax", runtimeMax);
      if (certification) params.set("certification", certification);
      if (status) params.set("status", status);
      if (selectedProviders.size > 0) params.set("providers", [...selectedProviders].join(","));
      if (providerMode !== "or") params.set("providerMode", providerMode);
      if (source) params.set("source", source);
      if (watchStatus) params.set("watchStatus", watchStatus);
      if (watchStatuses.size > 0) params.set("watchStatuses", [...watchStatuses].join(","));
      if (membersRatingMin > 0) params.set("memRating", String(membersRatingMin));

      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 300);

    return () => { if (emitRef.current) clearTimeout(emitRef.current); };
  }, [q, selectedGenres, genreMode, sortBy, language, scoreMode, scoreMin, yearMin, yearMax, runtimeMin, runtimeMax, certification, status, selectedProviders, providerMode, watchRegion, source, watchStatus, watchStatuses, membersRatingMin, onFilterChange, buildOutput, searchParams, router, pathname, fallbackSort]);

  // Handlers
  const toggleGenre = (id: number): void => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReset = useCallback((): void => {
    setQ("");
    setSelectedGenres(new Set());
    setGenreMode("or");
    setSortBy(fallbackSort);
    setLanguage("");
    setScoreMode("higher");
    setScoreMin(0);
    setScoreDisplay(0);
    setYearMin("");
    setYearMax("");
    setRuntimeMin("");
    setRuntimeMax("");
    setCertification("");
    setStatus("");
    setSelectedProviders(new Set());
    setProviderMode("or");
    setSource("");
    setWatchStatus("");
    setWatchStatuses(new Set());
    setMembersRatingMin(0);
    setMembersRatingDisplay(0);
  }, [fallbackSort]);

  // Expose reset to parent via ref
  useEffect(() => {
    if (!resetRef) return;
    resetRef.current = { reset: handleReset };
    return () => {
      resetRef.current = null;
    };
  }, [resetRef, handleReset]);

  const isDesc = sortBy.endsWith(".desc");
  const SortIcon = isDesc ? ArrowDown : ArrowUp;

  const toggleSortOrder = (): void => {
    const [field] = sortBy.split(".");
    setSortBy(`${field}.${isDesc ? "asc" : "desc"}`);
  };

  const showStatus = mediaType !== "movie" && show("status");
  const showCertification = show("certification");
  const certType: "movie" | "tv" = mediaType === "show" ? "tv" : "movie";
  const { data: certByRegion } = trpc.provider.certifications.useQuery(
    { type: certType },
    { staleTime: 60 * 60 * 1000, enabled: showCertification },
  );
  const certOptions = useMemo(
    () => certByRegion?.[watchRegion] ?? certByRegion?.US ?? [],
    [certByRegion, watchRegion],
  );

  useEffect(() => {
    if (
      certByRegion &&
      certification &&
      !certOptions.some((c) => c.value === certification)
    ) {
      setCertification("");
    }
  }, [certification, certOptions, certByRegion]);

  const hasTmdbGroup =
    show("genres") ||
    show("year") ||
    show("score") ||
    show("runtime") ||
    show("language") ||
    showStatus ||
    showCertification ||
    show("watchProviders");

  const primaryGroupLabel: string | null = isLibrary
    ? "Library"
    : showMembersRating
      ? "Collection"
      : null;

  // Watch status filter: available on library feeds and collection detail
  const showWatchStatusSection = (isLibrary || showMembersRating) && show("watchStatus");

  return (
    <div className={cn(hideHeader ? "" : "pt-3", className)}>
      {/* Header */}
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Filter</h2>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] text-foreground transition-colors hover:text-foreground"
            onClick={handleReset}
          >
            <RotateCcw size={13} />
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-col">
        {primaryGroupLabel && <GroupHeader label={primaryGroupLabel} first />}

        {/* Search */}
        {show("search") && (
          <div className="border-b border-border py-4">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="text"
                placeholder="Search title..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="!h-9 !rounded-xl !border-0 !bg-accent !pl-8 !pr-8 !text-[13px] !font-medium !text-foreground !placeholder:text-muted-foreground"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sort By */}
        {show("sort") && (
          <Section label="Sort By" defaultOpen>
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-9 flex-1 appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground outline-none"
              >
                {[
                  ...(isLibrary ? LIBRARY_SORT_OPTIONS : SORT_OPTIONS),
                  ...(showMembersRating ? [...COLLECTION_SORT_OPTIONS, ...MEMBERS_RATING_SORT_OPTIONS] : []),
                ].map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {!isLibrary && (
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-0 bg-accent text-muted-foreground transition-colors hover:text-foreground"
                  onClick={toggleSortOrder}
                >
                  <SortIcon size={14} />
                </button>
              )}
            </div>
          </Section>
        )}

        {/* Source (library only) */}
        {isLibrary && show("source") && (
          <Section label="Source" defaultOpen>
            <div className="flex flex-wrap gap-1">
              <Pill label="All" active={source === ""} onClick={() => setSource("")} />
              {SOURCE_OPTIONS.map((s) => (
                <Pill
                  key={s.value}
                  label={s.label}
                  active={source === s.value}
                  onClick={() => setSource(source === s.value ? "" : s.value)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Watch Status — collection: multi-select; library: single-select */}
        {showWatchStatusSection && showMembersRating && (
          <Section label="Watch Status" defaultOpen>
            <div className="flex flex-wrap gap-1">
              <Pill
                label="All"
                active={watchStatuses.size === 0}
                onClick={() => setWatchStatuses(new Set())}
              />
              {COLLECTION_WATCH_STATUS_OPTIONS.map((ws) => (
                <Pill
                  key={ws.value}
                  label={ws.label}
                  active={watchStatuses.has(ws.value)}
                  onClick={() => {
                    setWatchStatuses((prev) => {
                      const next = new Set(prev);
                      if (next.has(ws.value)) next.delete(ws.value);
                      else next.add(ws.value);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </Section>
        )}
        {showWatchStatusSection && !showMembersRating && (
          <Section label="Watch Status" defaultOpen>
            <div className="flex flex-wrap gap-1">
              <Pill label="All" active={watchStatus === ""} onClick={() => setWatchStatus("")} />
              {WATCH_STATUS_OPTIONS.map((ws) => (
                <Pill
                  key={ws.value}
                  label={ws.label}
                  active={watchStatus === ws.value}
                  onClick={() => setWatchStatus(watchStatus === ws.value ? "" : ws.value)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Members Rating (collection preset) */}
        {showMembersRating && show("membersRating") && (
          <Section label="Members Rating" defaultOpen>
            <div className="flex flex-col gap-1 pb-4">
              <Slider
                value={[membersRatingDisplay]}
                onValueChange={(v) => setMembersRatingDisplay(v[0] ?? 0)}
                onValueCommit={(v) => setMembersRatingMin(v[0] ?? 0)}
                min={0}
                max={10}
                step={0.5}
                showTooltip
                formatValue={(v) => String(v)}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>10</span>
              </div>
            </div>
          </Section>
        )}

        {/* ─── Media fields group ─── */}
        {hasTmdbGroup && <GroupHeader label="Media Fields" />}

        {/* Genres */}
        {show("genres") && (
          <Section
            label="Genres"
            trailing={
              <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    genreMode === "or"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setGenreMode("or")}
                >
                  OR
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    genreMode === "and"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setGenreMode("and")}
                >
                  AND
                </button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-1">
              {genreList ? (
                genreList.map((g) => (
                  <Pill
                    key={g.id}
                    label={g.name}
                    active={selectedGenres.has(g.id)}
                    onClick={() => toggleGenre(g.id)}
                  />
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Loading...</span>
              )}
            </div>
          </Section>
        )}

        {/* Release Date */}
        {show("year") && (
          <Section label="Release Date">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="From"
                min={1900}
                max={2030}
                value={yearMin}
                onChange={(e) => setYearMin(e.target.value)}
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground !placeholder:text-foreground"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="To"
                min={1900}
                max={2030}
                value={yearMax}
                onChange={(e) => setYearMax(e.target.value)}
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground !placeholder:text-foreground"
              />
            </div>
          </Section>
        )}

        {/* Score */}
        {show("score") && (
          <Section
            label="Public Rating"
            trailing={
              <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    scoreMode === "higher"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setScoreMode("higher")}
                >
                  Higher
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    scoreMode === "lower"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setScoreMode("lower")}
                >
                  Lower
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-1 pb-4">
              <Slider
                value={[scoreDisplay]}
                onValueChange={(v) => setScoreDisplay(v[0] ?? 0)}
                onValueCommit={(v) => setScoreMin(v[0] ?? 0)}
                min={0}
                max={10}
                step={0.5}
                showTooltip
                formatValue={(v) => String(v)}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>10</span>
              </div>
            </div>
          </Section>
        )}

        {/* Runtime */}
        {show("runtime") && (
          <Section label="Duration">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Min"
                value={runtimeMin}
                onChange={(e) => setRuntimeMin(e.target.value.replace(/\D/g, ""))}
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground !placeholder:text-foreground"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="text"
                placeholder="Max"
                value={runtimeMax}
                onChange={(e) => setRuntimeMax(e.target.value.replace(/\D/g, ""))}
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground !placeholder:text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">min</span>
            </div>
          </Section>
        )}

        {/* Language */}
        {show("language") && (
          <Section label="Original Language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-9 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </Section>
        )}

        {/* Status (TV only) */}
        {showStatus && (
          <Section label="Status">
            <div className="flex flex-wrap gap-1">
              <Pill label="All" active={status === ""} onClick={() => setStatus("")} />
              {TV_STATUS.map((s) => (
                <Pill
                  key={s.value}
                  label={s.label}
                  active={status === s.value}
                  onClick={() => setStatus(status === s.value ? "" : s.value)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Certification */}
        {showCertification && (
          <Section label="Content Rating">
            <div className="flex flex-wrap gap-1">
              <Pill label="All" active={certification === ""} onClick={() => setCertification("")} />
              {certOptions.map((c) => (
                <Pill
                  key={c.value}
                  label={c.label}
                  active={certification === c.value}
                  onClick={() => setCertification(certification === c.value ? "" : c.value)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Watch Providers */}
        {show("watchProviders") && (
          <Section
            label="Watch Providers"
            trailing={(
                <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      providerMode === "or"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setProviderMode("or")}
                  >
                    OR
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      providerMode === "and"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setProviderMode("and")}
                  >
                    AND
                  </button>
                </div>
            )}
          >
            <div className="flex flex-wrap gap-2">
              {watchProvidersList && "providerId" in (watchProvidersList[0] ?? {}) ? (
                (watchProvidersList as Array<{ providerId: number; providerIds: number[]; providerName: string; logoPath: string; displayPriority: number }>)
                  .map((p) => {
                    const isSelected = p.providerIds.some((id) => selectedProviders.has(id));
                    return (
                      <div key={p.providerId} className="group relative">
                        <button
                          type="button"
                          className={cn(
                            "h-10 w-10 overflow-hidden rounded-xl border-2 transition-all",
                            isSelected
                              ? "border-primary shadow-md scale-110"
                              : "border-transparent opacity-60 hover:opacity-100",
                          )}
                          onClick={() => {
                            setSelectedProviders((prev) => {
                              const next = new Set(prev);
                              if (isSelected) {
                                for (const id of p.providerIds) next.delete(id);
                              } else {
                                for (const id of p.providerIds) next.add(id);
                              }
                              return next;
                            });
                          }}
                        >
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${p.logoPath}`}
                            alt={p.providerName}
                            width={40}
                            height={40}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <span className="pointer-events-none absolute -bottom-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[11px] font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          {p.providerName}
                        </span>
                      </div>
                    );
                  })
              ) : (
                <span className="text-xs text-muted-foreground">Loading...</span>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
