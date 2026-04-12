"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Slider } from "@canto/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@canto/ui/tabs";
import { Sparkles, MonitorPlay, LayoutGrid, Image as ImageIcon } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import type { HomeSectionConfig } from "@canto/db/schema";

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
  { value: "spotlight", label: "Spotlight", description: "Full-screen hero", icon: Sparkles },
  { value: "large_video", label: "Large Video", description: "Expandable with trailer", icon: MonitorPlay },
  { value: "card", label: "Card", description: "Backdrop cards", icon: LayoutGrid },
  { value: "cover", label: "Cover", description: "Poster cards", icon: ImageIcon },
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

/* ─── Component ─── */

export function SectionEditorDialog({
  open,
  onOpenChange,
  section,
  onSave,
}: SectionEditorDialogProps): React.JSX.Element {
  const isNew = !section?.id;

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

  // Sync state when section prop changes and dialog opens
  useEffect(() => {
    if (open) resetToSection(section);
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
      <DialogContent className="max-h-dvh max-w-2xl overflow-y-auto max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Section" : "Edit Section"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {/* Title */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Section title"
              className="h-10"
            />
          </div>

          {/* Style Picker */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Style</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStyle(value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all",
                    style === value
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                      : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-[10px] text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Data Source */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Data Source</label>
            <Tabs
              value={sourceType}
              onValueChange={(v) => setSourceType(v as "db" | "tmdb")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="db" className="flex-1">Library</TabsTrigger>
                <TabsTrigger value="tmdb" className="flex-1">TMDB</TabsTrigger>
              </TabsList>

              <TabsContent value="db" className="pt-3">
                <div className="flex flex-col gap-1">
                  {DB_SOURCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDbSourceKey(opt.value)}
                      className={cn(
                        "flex flex-col rounded-lg px-3 py-2 text-left transition-all",
                        dbSourceKey === opt.value
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTmdbType("movie")}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all",
                        tmdbType === "movie"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground",
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
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      TV Shows
                    </button>
                  </div>

                  {/* Mode */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTmdbMode("trending")}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all",
                        tmdbMode === "trending"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground",
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
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Discover
                    </button>
                  </div>

                  {/* Genres */}
                  {tmdbMode === "discover" && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-foreground">Genres</span>
                      <div className="flex flex-wrap gap-1">
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
                              "inline-flex items-center rounded-lg px-2.5 py-1 text-[12px] font-medium transition-all",
                              selectedGenres.has(g.id)
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
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
                      className="h-9 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground/70 outline-none"
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
                        className="h-9 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground/70 outline-none"
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
                        type="number"
                        placeholder="From"
                        min={1900}
                        max={2030}
                        value={yearMin}
                        onChange={(e) => setYearMin(e.target.value)}
                        className="h-9 text-[13px]"
                      />
                      <span className="text-xs text-muted-foreground">-</span>
                      <Input
                        type="number"
                        placeholder="To"
                        min={1900}
                        max={2030}
                        value={yearMax}
                        onChange={(e) => setYearMax(e.target.value)}
                        className="h-9 text-[13px]"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!title.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isNew ? "Add" : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
