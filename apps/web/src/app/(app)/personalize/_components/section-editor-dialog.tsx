"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Slider } from "@canto/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@canto/ui/tabs";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import type { HomeSectionConfig } from "@canto/db/schema";
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
  { value: "favorites", label: "Favorites", description: "Your favorite media" },
  { value: "planned", label: "Planned", description: "Media you plan to watch" },
];

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Popularity" },
  { value: "vote_average.desc", label: "Rating" },
  { value: "primary_release_date.desc", label: "Release Date" },
  { value: "title.asc", label: "Name A-Z" },
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
];

/* ─── Style Preview ─── */

/** Builds full URLs for local example images so they bypass the TMDB image loader. */
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
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground/70">
            <span>Movie</span>
            <span className="text-foreground/30">|</span>
            <span className="text-yellow-400">8.0</span>
            <span className="text-foreground/30">|</span>
            <span>1962</span>
            <span className="text-foreground/30">|</span>
            <span>Comedy</span>
            <span className="text-foreground/30">·</span>
            <span>Drama</span>
          </div>
          <p className="line-clamp-2 max-w-md text-xs leading-relaxed text-foreground/70">
            Roberto, a restless Italian playboy, picks up shy law student Bruno for an impromptu road trip through the Italian countryside.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex h-8 items-center rounded-xl bg-white px-4">
              <span className="text-xs font-semibold text-black">+ Watchlist</span>
            </div>
            <div className="flex h-8 items-center gap-1.5 rounded-xl bg-foreground/15 px-4">
              <span className="text-xs font-medium text-foreground">More Info</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (value === "large_video") {
    return (
      <div className="flex w-full justify-center overflow-hidden rounded-xl bg-black py-4">
        {/* Mimics FeaturedCard: fixed height, width expands on hover */}
        <div className="group/card relative h-72 w-44 shrink-0 overflow-hidden rounded-xl transition-[width] duration-300 ease-in-out hover:w-full hover:border hover:border-border/40">
          {/* Poster — visible when closed */}
          <div className="absolute inset-0 transition-opacity duration-300 group-hover/card:pointer-events-none group-hover/card:opacity-0">
            <img src="/poster-example.webp" alt="" className="h-full w-full object-cover" />
          </div>
          {/* Backdrop + trailer — visible when open */}
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
            <iframe
              src="https://www.youtube-nocookie.com/embed/X5Tjj5B7Kbc?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=X5Tjj5B7Kbc&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0"
              className="pointer-events-none absolute -inset-[60px] h-[calc(100%+120px)] w-[calc(100%+120px)] border-0"
              allow="autoplay; encrypted-media"
              title="Il Sorpasso trailer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5">
              <img src="/logo-example.webp" alt="Il Sorpasso" className="h-6 w-auto self-start drop-shadow-lg" />
              <div className="flex items-center gap-2 text-sm text-white/70">
                <span>Movie</span>
                <span className="text-white/30">·</span>
                <span className="text-yellow-400">8.0</span>
                <span className="text-white/30">·</span>
                <span>1962</span>
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
        <BackdropCard
          externalId="24188"
          provider="tmdb"
          type="movie"
          title="Il Sorpasso"
          backdropPath={example.backdrop}
          logoPath={null}
          year={1962}
          voteAverage={8.0}
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none flex justify-center">
      <MediaCard
        externalId="24188"
        provider="tmdb"
        type="movie"
        title="Il Sorpasso"
        posterPath={example.poster}
        year={1962}
        voteAverage={8.0}
        showTitle={false}
        className="w-full max-w-[280px]"
      />
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
  const [sourceType, setSourceType] = useState<"db" | "tmdb">(
    () => (section?.sourceType === "db" ? "db" : "tmdb"),
  );
  const [dbSourceKey, setDbSourceKey] = useState(section?.sourceKey ?? "recommendations");

  // TMDB config state
  const cfg = (section?.config ?? {}) as Record<string, unknown>;
  const [tmdbType, setTmdbType] = useState<"movie" | "show">(
    () => ((cfg.type as string) === "show" ? "show" : "movie"),
  );
  const [tmdbMode, setTmdbMode] = useState<"trending" | "discover">(
    () => ((cfg.mode as string) === "discover" ? "discover" : "trending"),
  );
  const [selectedGenres, setSelectedGenres] = useState<Set<number>>(
    () => new Set(cfg.genres ? String(cfg.genres).split(",").map(Number).filter(Boolean) : []),
  );
  const [language, setLanguage] = useState(() => String(cfg.language || ""));
  const [sortBy, setSortBy] = useState(() => String(cfg.sortBy || "popularity.desc"));
  const [scoreMin, setScoreMin] = useState(() => Number(cfg.scoreMin) || 0);
  const [yearMin, setYearMin] = useState(() => String(cfg.dateFrom || ""));
  const [yearMax, setYearMax] = useState(() => String(cfg.dateTo || ""));

  // Reset state when dialog opens with a new section
  const resetToSection = useCallback((s: SectionDraft | null) => {
    const c = (s?.config ?? {}) as Record<string, unknown>;
    setTitle(s?.title ?? "");
    setStyle(s?.style ?? "card");
    setSourceType(s?.sourceType === "db" ? "db" : "tmdb");
    setDbSourceKey(s?.sourceKey ?? "recommendations");
    setTmdbType((c.type as string) === "show" ? "show" : "movie");
    setTmdbMode((c.mode as string) === "discover" ? "discover" : "trending");
    setSelectedGenres(new Set(c.genres ? String(c.genres).split(",").map(Number).filter(Boolean) : []));
    setLanguage(String(c.language || ""));
    setSortBy(String(c.sortBy || "popularity.desc"));
    setScoreMin(Number(c.scoreMin) || 0);
    setYearMin(String(c.dateFrom || ""));
    setYearMax(String(c.dateTo || ""));
  }, []);

  useEffect(() => {
    if (open) {
      resetToSection(section);
      setStep(0);
    }
  }, [open, section, resetToSection]);

  // Genres from TMDB
  const { data: genreList } = trpc.provider.genres.useQuery(
    { type: tmdbType },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );

  const handleSave = useCallback(() => {
    const buildConfig = (): HomeSectionConfig => {
      if (sourceType === "db") return {};
      const config: Record<string, unknown> = {
        type: tmdbType,
        mode: tmdbMode,
      };
      if (selectedGenres.size > 0) config.genres = [...selectedGenres].join(",");
      if (language) config.language = language;
      if (sortBy !== "popularity.desc") config.sortBy = sortBy;
      if (scoreMin > 0) config.scoreMin = scoreMin;
      if (yearMin) config.dateFrom = yearMin;
      if (yearMax) config.dateTo = yearMax;
      return config as HomeSectionConfig;
    };

    onSave({
      id: section?.id,
      position: section?.position ?? 0,
      title: title.trim() || "Untitled Section",
      style,
      sourceType,
      sourceKey: sourceType === "db" ? dbSourceKey : tmdbMode,
      config: buildConfig(),
      enabled: section?.enabled ?? true,
    });
    onOpenChange(false);
  }, [section, title, style, sourceType, dbSourceKey, tmdbType, tmdbMode, selectedGenres, language, sortBy, scoreMin, yearMin, yearMax, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh max-w-2xl flex-col gap-0 overflow-hidden p-0 max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-h-[85vh]">
        <DialogHeader bar>
          <DialogTitle>{isNew ? "Add Section" : "Edit Section"}</DialogTitle>
        </DialogHeader>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">Title</label>
                <Input
                  variant="ghost"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Section title"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">Data Source</label>
                <Tabs
                  value={sourceType}
                  onValueChange={(v) => setSourceType(v as "db" | "tmdb")}
                >
                  <TabsList className="w-full rounded-xl">
                    <TabsTrigger value="db" className="flex-1 rounded-lg">Library</TabsTrigger>
                    <TabsTrigger value="tmdb" className="flex-1 rounded-lg">TMDB</TabsTrigger>
                  </TabsList>

                  <TabsContent value="db" className="pt-3">
                    <div className="flex flex-col gap-1">
                      {DB_SOURCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDbSourceKey(opt.value)}
                          className={cn(
                            "flex flex-col rounded-xl px-3 py-2.5 text-left transition-all",
                            dbSourceKey === opt.value
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )}
                        >
                          <span className="text-sm font-medium">{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.description}</span>
                        </button>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="tmdb" className="pt-3">
                    <div className="flex flex-col gap-4">
                      {/* Type */}
                      <div className="flex rounded-xl bg-accent p-1">
                        <button
                          type="button"
                          onClick={() => setTmdbType("movie")}
                          className={cn(
                            "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all",
                            tmdbType === "movie"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Movies
                        </button>
                        <button
                          type="button"
                          onClick={() => setTmdbType("show")}
                          className={cn(
                            "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all",
                            tmdbType === "show"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          TV Shows
                        </button>
                      </div>

                      {/* Mode */}
                      <div className="flex rounded-xl bg-accent p-1">
                        <button
                          type="button"
                          onClick={() => setTmdbMode("trending")}
                          className={cn(
                            "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all",
                            tmdbMode === "trending"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Trending
                        </button>
                        <button
                          type="button"
                          onClick={() => setTmdbMode("discover")}
                          className={cn(
                            "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all",
                            tmdbMode === "discover"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Discover
                        </button>
                      </div>

                      {/* Genres */}
                      {tmdbMode === "discover" && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-foreground">Genres</span>
                          <div className="flex flex-wrap gap-1.5">
                            {genreList?.map((g) => (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => {
                                  setSelectedGenres((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(g.id)) next.delete(g.id);
                                    else next.add(g.id);
                                    return next;
                                  });
                                }}
                                className={cn(
                                  "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                                  selectedGenres.has(g.id)
                                    ? "bg-foreground text-background"
                                    : "bg-accent text-muted-foreground hover:text-foreground",
                                )}
                              >
                                {g.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Language */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-foreground">Language</span>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          className="h-10 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-sm text-foreground outline-none"
                        >
                          {LANGUAGES.map((l) => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Sort */}
                      {tmdbMode === "discover" && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-foreground">Sort By</span>
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="h-10 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-sm text-foreground outline-none"
                          >
                            {SORT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Score */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-foreground">
                          Minimum Score {scoreMin > 0 ? `(${scoreMin})` : ""}
                        </span>
                        <Slider
                          value={[scoreMin]}
                          onValueChange={(v) => setScoreMin(v[0] ?? 0)}
                          min={0}
                          max={10}
                          step={0.5}
                          className="w-full"
                        />
                      </div>

                      {/* Year Range */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-foreground">Year Range</span>
                        <div className="flex items-center gap-2">
                          <Input
                            variant="ghost"
                            type="number"
                            placeholder="From"
                            min={1900}
                            max={2030}
                            value={yearMin}
                            onChange={(e) => setYearMin(e.target.value)}
                            className="text-sm"
                          />
                          <span className="text-xs text-muted-foreground">-</span>
                          <Input
                            variant="ghost"
                            type="number"
                            placeholder="To"
                            min={1900}
                            max={2030}
                            value={yearMax}
                            onChange={(e) => setYearMax(e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

            </div>
          ) : (
            /* ── Step 2: Style (scroll vertical, 1 coluna) ── */
            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium text-foreground">Select the section format</label>
              {STYLE_OPTIONS.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStyle(value)}
                  className={cn(
                    "relative flex flex-col gap-3 overflow-hidden rounded-xl p-3 text-left transition-all",
                    style === value
                      ? "bg-accent ring-1 ring-foreground"
                      : "bg-accent/40 hover:bg-accent/70",
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

        {/* ── Fixed footer ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/40 px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => setStep(0)}
                className="rounded-xl"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
            )}
            {step === 0 ? (
              <Button onClick={() => setStep(1)} className="rounded-xl">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={!title.trim()}
                className="rounded-xl"
              >
                {isNew ? "Add" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
