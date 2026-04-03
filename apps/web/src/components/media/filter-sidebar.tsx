"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import { Slider } from "@canto/ui/slider";
import { ChevronDown, ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";

/* ─── Output Type ─── */

export interface FilterOutput {
  // TMDB discover params
  genres?: string;
  genreMode?: "and" | "or";
  language?: string;
  sortBy?: string;
  scoreMin?: number;
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
}

/* ─── Constants ─── */

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Popularity" },
  { value: "vote_average.desc", label: "Rating" },
  { value: "primary_release_date.desc", label: "Release Date" },
  { value: "title.asc", label: "Name A-Z" },
  { value: "title.desc", label: "Name Z-A" },
];

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

const MOVIE_CERTIFICATIONS = [
  { value: "G", label: "G" },
  { value: "PG", label: "PG" },
  { value: "PG-13", label: "PG-13" },
  { value: "R", label: "R" },
  { value: "NC-17", label: "NC-17" },
];

const TV_CERTIFICATIONS = [
  { value: "TV-Y", label: "TV-Y" },
  { value: "TV-G", label: "TV-G" },
  { value: "TV-PG", label: "TV-PG" },
  { value: "TV-14", label: "TV-14" },
  { value: "TV-MA", label: "TV-MA" },
];

type SectionId = "sort" | "genres" | "year" | "score" | "runtime" | "language" | "status" | "certification" | "watchProviders";

/** URL param keys owned by FilterSidebar — everything else is preserved. */
const FILTER_KEYS = ["genre", "genreMode", "sort", "language", "score", "yearMin", "yearMax", "runtimeMin", "runtimeMax", "certification", "status", "providers", "providerMode"] as const;

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
    <div className="border-b border-border/40 py-4 last:border-b-0">
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

/* ─── Main Component ─── */

interface FilterSidebarProps {
  mediaType: "movie" | "show" | "all";
  onFilterChange: (filters: FilterOutput) => void;
  hideSections?: SectionId[];
}

export function FilterSidebar({
  mediaType,
  onFilterChange,
  hideSections = [],
}: FilterSidebarProps): React.JSX.Element {
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
  const [selectedGenres, setSelectedGenres] = useState<Set<number>>(() => parseSet(searchParams.get("genre")));
  const [genreMode, setGenreMode] = useState<"and" | "or">((searchParams.get("genreMode") as "and" | "or") || "or");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") ?? "popularity.desc");
  const [language, setLanguage] = useState(searchParams.get("language") ?? "");
  const [scoreMin, setScoreMin] = useState(searchParams.get("score") ? Number(searchParams.get("score")) : 0);
  const [scoreDisplay, setScoreDisplay] = useState(searchParams.get("score") ? Number(searchParams.get("score")) : 0);
  const [yearMin, setYearMin] = useState(searchParams.get("yearMin") ?? "");
  const [yearMax, setYearMax] = useState(searchParams.get("yearMax") ?? "");
  const [runtimeMin, setRuntimeMin] = useState(searchParams.get("runtimeMin") ?? "");
  const [runtimeMax, setRuntimeMax] = useState(searchParams.get("runtimeMax") ?? "");
  const [certification, setCertification] = useState(searchParams.get("certification") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [selectedProviders, setSelectedProviders] = useState<Set<number>>(() => parseSet(searchParams.get("providers")));
  const [providerMode, setProviderMode] = useState<"and" | "or">((searchParams.get("providerMode") as "and" | "or") || "or");
  const { region: watchRegion } = useWatchRegion();

  // Watch providers for the region
  const { data: watchProvidersList } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: genreType, region: watchRegion },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );

  // Build FilterOutput from current state
  const buildOutput = useCallback((): FilterOutput => {
    const f: FilterOutput = {};
    if (selectedGenres.size > 0) {
      const ids = [...selectedGenres];
      f.genres = ids.join(genreMode === "or" ? "|" : ",");
      f.genreMode = genreMode;
      f.genreIds = ids;
    }
    if (sortBy !== "popularity.desc") f.sortBy = sortBy;
    if (language) f.language = language;
    if (scoreMin > 0) f.scoreMin = scoreMin;
    if (yearMin) f.yearMin = yearMin;
    if (yearMax) f.yearMax = yearMax;
    if (runtimeMin) f.runtimeMin = Number(runtimeMin);
    if (runtimeMax) f.runtimeMax = Number(runtimeMax);
    if (certification) f.certification = certification;
    if (status) f.status = status;
    if (selectedProviders.size > 0) {
      f.watchProviders = [...selectedProviders].join(providerMode === "or" ? "|" : ",");
      f.watchRegion = watchRegion;
    }
    return f;
  }, [selectedGenres, genreMode, sortBy, language, scoreMin, yearMin, yearMax, runtimeMin, runtimeMax, certification, status, selectedProviders, providerMode, watchRegion]);

  // Sync state → URL + emit to parent
  const emitRef = useRef<ReturnType<typeof setTimeout>>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const hasParams = selectedGenres.size > 0 || language || sortBy !== "popularity.desc" || yearMin || yearMax || scoreMin > 0 || runtimeMin || runtimeMax || certification || status || selectedProviders.size > 0;

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
      if (selectedGenres.size > 0) params.set("genre", [...selectedGenres].join(","));
      if (genreMode !== "or") params.set("genreMode", genreMode);
      if (sortBy !== "popularity.desc") params.set("sort", sortBy);
      if (language) params.set("language", language);
      if (scoreMin > 0) params.set("score", String(scoreMin));
      if (yearMin) params.set("yearMin", yearMin);
      if (yearMax) params.set("yearMax", yearMax);
      if (runtimeMin) params.set("runtimeMin", runtimeMin);
      if (runtimeMax) params.set("runtimeMax", runtimeMax);
      if (certification) params.set("certification", certification);
      if (status) params.set("status", status);
      if (selectedProviders.size > 0) params.set("providers", [...selectedProviders].join(","));
      if (providerMode !== "or") params.set("providerMode", providerMode);

      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 300);

    return () => { if (emitRef.current) clearTimeout(emitRef.current); };
  }, [selectedGenres, genreMode, sortBy, language, scoreMin, yearMin, yearMax, runtimeMin, runtimeMax, certification, status, selectedProviders, providerMode, watchRegion, onFilterChange, buildOutput, searchParams, router, pathname]);

  // Handlers
  const toggleGenre = (id: number): void => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReset = (): void => {
    setSelectedGenres(new Set());
    setGenreMode("or");
    setSortBy("popularity.desc");
    setLanguage("");
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
  };

  const isDesc = sortBy.endsWith(".desc");
  const SortIcon = isDesc ? ArrowDown : ArrowUp;

  const toggleSortOrder = (): void => {
    const [field] = sortBy.split(".");
    setSortBy(`${field}.${isDesc ? "asc" : "desc"}`);
  };

  const showStatus = mediaType !== "movie" && show("status");
  const showCertification = show("certification");
  const certOptions = mediaType === "show" ? TV_CERTIFICATIONS : MOVIE_CERTIFICATIONS;

  return (
    <div className="pt-2">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Filter</h2>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[13px] text-foreground/70 transition-colors hover:text-foreground"
          onClick={handleReset}
        >
          <RotateCcw size={13} />
          Clear
        </button>
      </div>

      <div className="flex flex-col">
        {/* Sort By */}
        {show("sort") && (
          <Section label="Sort By" defaultOpen>
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-9 flex-1 appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground/70 outline-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-0 bg-accent text-muted-foreground transition-colors hover:text-foreground"
                onClick={toggleSortOrder}
              >
                <SortIcon size={14} />
              </button>
            </div>
          </Section>
        )}

        {/* Genres */}
        {show("genres") && (
          <Section
            label="Genres"
            defaultOpen
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
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground/70 !placeholder:text-foreground/30"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="To"
                min={1900}
                max={2030}
                value={yearMax}
                onChange={(e) => setYearMax(e.target.value)}
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground/70 !placeholder:text-foreground/30"
              />
            </div>
          </Section>
        )}

        {/* Score */}
        {show("score") && (
          <Section label="Public Rating">
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
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground/70 !placeholder:text-foreground/30"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="text"
                placeholder="Max"
                value={runtimeMax}
                onChange={(e) => setRuntimeMax(e.target.value.replace(/\D/g, ""))}
                className="!h-9 !rounded-xl !border-0 !bg-accent !text-[13px] !font-medium !text-foreground/70 !placeholder:text-foreground/30"
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
              className="h-9 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground/70 outline-none"
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
                (watchProvidersList as Array<{ providerId: number; providerName: string; logoPath: string; displayPriority: number }>)
                  .slice(0, 20)
                  .map((p) => (
                    <div key={p.providerId} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          "h-10 w-10 overflow-hidden rounded-xl border-2 transition-all",
                          selectedProviders.has(p.providerId)
                            ? "border-primary shadow-md scale-110"
                            : "border-transparent opacity-60 hover:opacity-100",
                        )}
                        onClick={() => {
                          setSelectedProviders((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.providerId)) next.delete(p.providerId);
                            else next.add(p.providerId);
                            return next;
                          });
                        }}
                      >
                        <img
                          src={`https://image.tmdb.org/t/p/w92${p.logoPath}`}
                          alt={p.providerName}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <span className="pointer-events-none absolute -bottom-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[11px] font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        {p.providerName}
                      </span>
                    </div>
                  ))
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
