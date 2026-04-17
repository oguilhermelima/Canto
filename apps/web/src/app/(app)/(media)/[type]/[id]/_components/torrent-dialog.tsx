"use client";

import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  ArrowUp,
  ArrowDown,
  HardDrive,
  Clock,
  Monitor,
  Film as FilmIcon,
  Zap,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import {
  formatBytes,
  formatAge,
  formatQualityLabel,
  sourceLabel,
} from "~/lib/torrent-utils";
import { FolderSelector } from "./folder-selector";

interface TorrentResult {
  guid: string;
  title: string;
  magnetUrl: string | null;
  downloadUrl: string | null;
  quality: string;
  source: string;
  confidence: number;
  seeders: number;
  leechers: number;
  size: number;
  age: number;
  indexer: string;
  indexerLanguage?: string | null;
  languages: string[];
  flags: string[];
}

interface TorrentDialogProps {
  media: {
    id: string;
    title: string;
    type: string;
    seasons?: Array<{ number: number }>;
  };
  isAdmin: boolean;
  torrentDialogOpen: boolean;
  setTorrentDialogOpen: (open: boolean) => void;
  torrentSearchContext: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null;
  setTorrentSearchContext: (
    ctx: { seasonNumber?: number; episodeNumbers?: number[] } | null,
  ) => void;
  torrentSearchQuery: string;
  setTorrentSearchQuery: (q: string) => void;
  torrentPage: number;
  setTorrentPage: (p: number | ((prev: number) => number)) => void;
  torrentQualityFilter: string;
  setTorrentQualityFilter: (f: string) => void;
  torrentSourceFilter: string;
  setTorrentSourceFilter: (f: string) => void;
  torrentSizeFilter: string;
  setTorrentSizeFilter: (f: string) => void;
  torrentSort: "seeders" | "peers" | "size" | "age" | "confidence";
  torrentSortDir: "asc" | "desc";
  toggleSort: (
    col: "seeders" | "peers" | "size" | "age" | "confidence",
  ) => void;
  advancedSearch: boolean;
  setAdvancedSearch: (v: boolean) => void;
  advancedQuery: string;
  setAdvancedQuery: (q: string) => void;
  committedQuery: string;
  setCommittedQuery: (q: string) => void;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  selectedFolderId: string | undefined;
  setSelectedFolderId: (id: string | undefined) => void;
  torrentSearch: {
    isLoading: boolean;
    isError: boolean;
    error?: { message: string } | null;
    refetch: () => void;
  };
  paginatedTorrents: TorrentResult[];
  allFilteredTorrents: TorrentResult[];
  hasMore: boolean;
  handleDownload: (url: string, title: string) => void;
  downloadTorrent: { isPending: boolean };
  setLastDownloadAttempt: (v: { url: string; title: string } | null) => void;
}

export function TorrentDialog({
  media,
  isAdmin,
  torrentDialogOpen,
  setTorrentDialogOpen,
  torrentSearchContext,
  setTorrentSearchContext,
  torrentSearchQuery,
  setTorrentSearchQuery,
  torrentPage,
  setTorrentPage,
  torrentQualityFilter,
  setTorrentQualityFilter,
  torrentSourceFilter,
  setTorrentSourceFilter,
  torrentSizeFilter,
  setTorrentSizeFilter,
  torrentSort,
  torrentSortDir,
  toggleSort,
  advancedSearch,
  setAdvancedSearch,
  advancedQuery,
  setAdvancedQuery,
  committedQuery,
  setCommittedQuery,
  mobileFiltersOpen,
  setMobileFiltersOpen,
  selectedFolderId,
  setSelectedFolderId,
  torrentSearch,
  paginatedTorrents,
  allFilteredTorrents,
  hasMore,
  handleDownload,
  downloadTorrent,
  setLastDownloadAttempt,
}: TorrentDialogProps): React.JSX.Element {
  const isSeasonPreselected = torrentSearchContext?.seasonNumber !== undefined;

  return (
    <Dialog
      open={torrentDialogOpen}
      onOpenChange={(open) => {
        setTorrentDialogOpen(open);
        if (!open) {
          setTorrentSearchContext(null);
          setTorrentSearchQuery("");
          setTorrentPage(0);
          setTorrentQualityFilter("all");
          setTorrentSourceFilter("all");
          setTorrentSizeFilter("all");
          setLastDownloadAttempt(null);
          setAdvancedSearch(false);
          setAdvancedQuery("");
          setCommittedQuery("");
          setSelectedFolderId(undefined);
        }
      }}
    >
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-auto md:max-h-[70vh] md:max-w-5xl md:rounded-[2rem] [&>button:last-child]:hidden">
        <DialogHeader bar className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1" style={{ height: "1.75rem" }}>
            <DialogTitle
              className={cn(
                "absolute inset-0 flex items-center truncate transition-all duration-300",
                advancedSearch
                  ? "pointer-events-none translate-y-1 opacity-0"
                  : "translate-y-0 opacity-100",
              )}
            >
              {media.title}
              {isSeasonPreselected && (
                <span className="text-muted-foreground">
                  {" "}
                  — S
                  {String(torrentSearchContext!.seasonNumber).padStart(2, "0")}
                  {torrentSearchContext!.episodeNumbers &&
                    torrentSearchContext!.episodeNumbers.length > 0 && (
                      <span>
                        E
                        {torrentSearchContext!.episodeNumbers
                          .map((n) => String(n).padStart(2, "0"))
                          .join(", E")}
                      </span>
                    )}
                </span>
              )}
            </DialogTitle>
            <div
              className={cn(
                "absolute inset-0 flex items-center border-b transition-all duration-300",
                advancedSearch
                  ? "border-foreground opacity-100 delay-150"
                  : "pointer-events-none border-transparent opacity-0",
              )}
            >
              <input
                ref={(el) => {
                  if (el && advancedSearch) el.focus();
                }}
                value={advancedQuery}
                onChange={(e) => setAdvancedQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setCommittedQuery(advancedQuery.trim());
                    setTorrentPage(0);
                  }
                  if (e.key === "Escape") {
                    setAdvancedSearch(false);
                    setAdvancedQuery("");
                    setCommittedQuery("");
                    setTorrentPage(0);
                  }
                }}
                className="w-full bg-transparent text-lg font-semibold tracking-tight text-foreground caret-primary outline-none"
              />
            </div>
            <DialogDescription className="sr-only">
              Search torrents for {media.title}
            </DialogDescription>
          </div>

          {/* Search button — advanced only */}
          {advancedSearch && (
            <button
              onClick={() => {
                setCommittedQuery(advancedQuery.trim());
                setTorrentPage(0);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-80"
            >
              <Search size={14} />
            </button>
          )}

          {/* Advanced toggle — desktop */}
          <label className="hidden shrink-0 cursor-pointer items-center gap-2 md:flex">
            <span className="text-xs text-muted-foreground">
              Advanced Search
            </span>
            <button
              role="switch"
              aria-checked={advancedSearch}
              onClick={() => {
                if (advancedSearch) {
                  setAdvancedSearch(false);
                  setAdvancedQuery("");
                  setCommittedQuery("");
                  setTorrentPage(0);
                } else {
                  setAdvancedSearch(true);
                  setAdvancedQuery(media.title);
                  setCommittedQuery("");
                }
              }}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                advancedSearch ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                  advancedSearch
                    ? "translate-x-[18px]"
                    : "translate-x-[3px]",
                )}
              />
            </button>
          </label>

          {/* Close */}
          <button
            onClick={() => setTorrentDialogOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </DialogHeader>

        {/* Folder selector */}
        {isAdmin && (
          <FolderSelector
            mediaId={media.id}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
          />
        )}

        {/* Filter toolbar */}
        <div className="shrink-0 border-b border-border px-5 pb-4 md:px-6">
          {/* Mobile filters */}
          <div className="overflow-hidden rounded-2xl bg-muted/40 md:hidden">
            <div className="flex items-center">
              <button
                onClick={() => setMobileFiltersOpen((o: boolean) => !o)}
                className="flex flex-1 items-center gap-2 px-4 py-3 text-xs font-medium text-muted-foreground"
              >
                <SlidersHorizontal size={14} />
                Filters & Sort
                <ChevronDown
                  size={12}
                  className={cn(
                    "ml-auto transition-transform duration-300",
                    mobileFiltersOpen && "rotate-180",
                  )}
                />
              </button>
              <div className="mr-3 h-5 w-px bg-border/30" />
              <label className="mr-3 flex cursor-pointer items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Advanced Search
                </span>
                <button
                  role="switch"
                  aria-checked={advancedSearch}
                  onClick={() => {
                    if (advancedSearch) {
                      setAdvancedSearch(false);
                      setAdvancedQuery("");
                      setCommittedQuery("");
                      setTorrentPage(0);
                    } else {
                      setAdvancedSearch(true);
                      setAdvancedQuery(media.title);
                      setCommittedQuery("");
                    }
                  }}
                  className={cn(
                    "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                    advancedSearch
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3 w-3 rounded-full bg-background shadow-sm transition-transform",
                      advancedSearch
                        ? "translate-x-[14px]"
                        : "translate-x-[2px]",
                    )}
                  />
                </button>
              </label>
            </div>

            {/* Expandable panel */}
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                mobileFiltersOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      placeholder="Filter results..."
                      value={torrentSearchQuery}
                      onChange={(e) => {
                        setTorrentSearchQuery(e.target.value);
                        setTorrentPage(0);
                      }}
                      className="h-10 w-full rounded-xl border-0 bg-background pl-9 text-sm focus-visible:ring-1"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      value={torrentQualityFilter}
                      onValueChange={(value) => {
                        setTorrentQualityFilter(value);
                        setTorrentPage(0);
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-0 bg-background px-3 text-xs text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Quality</SelectItem>
                        <SelectItem value="uhd">4K</SelectItem>
                        <SelectItem value="fullhd">1080p</SelectItem>
                        <SelectItem value="hd">720p</SelectItem>
                        <SelectItem value="sd">SD</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={torrentSourceFilter}
                      onValueChange={(value) => {
                        setTorrentSourceFilter(value);
                        setTorrentPage(0);
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-0 bg-background px-3 text-xs text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Source</SelectItem>
                        <SelectItem value="remux">Remux</SelectItem>
                        <SelectItem value="bluray">Blu-Ray</SelectItem>
                        <SelectItem value="webdl">WEB-DL</SelectItem>
                        <SelectItem value="webrip">WEBRip</SelectItem>
                        <SelectItem value="hdtv">HDTV</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={torrentSizeFilter}
                      onValueChange={(value) => {
                        setTorrentSizeFilter(value);
                        setTorrentPage(0);
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-0 bg-background px-3 text-xs text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Size</SelectItem>
                        <SelectItem value="small">{"< 2 GB"}</SelectItem>
                        <SelectItem value="medium">2–10 GB</SelectItem>
                        <SelectItem value="large">{"> 10 GB"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="mr-0.5 text-xs text-muted-foreground">
                      Sort
                    </span>
                    {(["confidence", "seeders", "size", "age"] as const).map(
                      (col) => (
                        <button
                          key={col}
                          onClick={() => toggleSort(col)}
                          className={cn(
                            "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-xl text-xs transition-colors",
                            torrentSort === col
                              ? "bg-background font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {
                            {
                              confidence: "Score",
                              seeders: "Seeds",
                              size: "Size",
                              age: "Age",
                            }[col]
                          }
                          {torrentSort === col &&
                            (torrentSortDir === "desc" ? (
                              <ChevronDown size={10} />
                            ) : (
                              <ChevronUp size={10} />
                            ))}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop filters */}
          <div className="hidden md:block">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Filter results..."
                value={torrentSearchQuery}
                onChange={(e) => {
                  setTorrentSearchQuery(e.target.value);
                  setTorrentPage(0);
                }}
                className="h-10 rounded-xl border-0 bg-muted/40 pl-10 text-sm focus-visible:ring-1"
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Select
                value={torrentQualityFilter}
                onValueChange={(value) => {
                  setTorrentQualityFilter(value);
                  setTorrentPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-auto rounded-lg border-0 bg-muted/60 px-2.5 text-xs text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Quality</SelectItem>
                  <SelectItem value="uhd">4K</SelectItem>
                  <SelectItem value="fullhd">1080p</SelectItem>
                  <SelectItem value="hd">720p</SelectItem>
                  <SelectItem value="sd">SD</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={torrentSourceFilter}
                onValueChange={(value) => {
                  setTorrentSourceFilter(value);
                  setTorrentPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-auto rounded-lg border-0 bg-muted/60 px-2.5 text-xs text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Source</SelectItem>
                  <SelectItem value="remux">Remux</SelectItem>
                  <SelectItem value="bluray">Blu-Ray</SelectItem>
                  <SelectItem value="webdl">WEB-DL</SelectItem>
                  <SelectItem value="webrip">WEBRip</SelectItem>
                  <SelectItem value="hdtv">HDTV</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={torrentSizeFilter}
                onValueChange={(value) => {
                  setTorrentSizeFilter(value);
                  setTorrentPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-auto rounded-lg border-0 bg-muted/60 px-2.5 text-xs text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Size</SelectItem>
                  <SelectItem value="small">{"< 2 GB"}</SelectItem>
                  <SelectItem value="medium">2–10 GB</SelectItem>
                  <SelectItem value="large">{"> 10 GB"}</SelectItem>
                </SelectContent>
              </Select>
              <div className="mx-1 h-4 w-px bg-border/50" />
              <span className="text-xs text-muted-foreground">Sort</span>
              <div className="flex items-center gap-0.5">
                {(["confidence", "seeders", "size", "age"] as const).map(
                  (col) => (
                    <button
                      key={col}
                      onClick={() => toggleSort(col)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs transition-colors",
                        torrentSort === col
                          ? "bg-muted/60 font-medium text-foreground"
                          : "text-muted-foreground hover:text-muted-foreground",
                      )}
                    >
                      {
                        {
                          confidence: "Score",
                          seeders: "Seeds",
                          size: "Size",
                          age: "Age",
                        }[col]
                      }
                      {torrentSort === col &&
                        (torrentSortDir === "desc" ? (
                          <ChevronDown size={10} />
                        ) : (
                          <ChevronUp size={10} />
                        ))}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          {/* Season pills */}
          {!isSeasonPreselected &&
            media.type === "show" &&
            media.seasons && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Season
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={cn(
                      "h-8 rounded-xl px-3 text-xs font-medium transition-colors",
                      torrentSearchContext?.seasonNumber === undefined
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      setTorrentSearchContext(null);
                      setTorrentSearchQuery("");
                      setTorrentPage(0);
                    }}
                  >
                    All
                  </button>
                  {media.seasons
                    .filter((s) => s.number > 0)
                    .sort((a, b) => a.number - b.number)
                    .map((s) => (
                      <button
                        key={s.number}
                        className={cn(
                          "h-8 rounded-xl px-3 text-xs font-medium transition-colors",
                          torrentSearchContext?.seasonNumber === s.number
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => {
                          setTorrentSearchContext({
                            seasonNumber: s.number,
                          });
                          setTorrentSearchQuery("");
                          setTorrentPage(0);
                        }}
                      >
                        S{s.number.toString().padStart(2, "0")}
                      </button>
                    ))}
                </div>
              </div>
            )}
        </div>

        {/* Table results */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {torrentSearch.isLoading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 px-5 py-16">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div
                  className="absolute h-20 w-20 animate-ping rounded-full border border-primary"
                  style={{ animationDuration: "2s" }}
                />
                <div
                  className="absolute h-14 w-14 animate-ping rounded-full border border-primary"
                  style={{
                    animationDuration: "2s",
                    animationDelay: "0.4s",
                  }}
                />
                <div
                  className="absolute h-8 w-8 animate-ping rounded-full border border-primary"
                  style={{
                    animationDuration: "2s",
                    animationDelay: "0.8s",
                  }}
                />
                <Search size={20} className="relative z-10 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Scanning indexers
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Searching across all connected sources...
                </p>
              </div>
            </div>
          ) : torrentSearch.isError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-destructive">
                Search failed
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {torrentSearch.error?.message ??
                  "Could not reach indexer."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void torrentSearch.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : paginatedTorrents.length > 0 ? (
            <div className="flex flex-col gap-3 p-4">
              {paginatedTorrents.map((t, i) => {
                const url = t.magnetUrl ?? t.downloadUrl;
                const qLabel = formatQualityLabel(t.quality);
                const sLabel = sourceLabel(t.source);
                const hasFreeleech = t.flags.some((f: string) =>
                  f.includes("freeleech"),
                );
                return (
                  <div
                    key={`${t.guid}-${i}`}
                    className="overflow-hidden rounded-xl bg-muted/40 transition-colors hover:bg-muted/60"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-2.5 text-xs font-medium text-muted-foreground">
                      <span>
                        {t.indexer || "Unknown"}
                        {t.indexerLanguage && (
                          <span className="ml-1 text-muted-foreground">
                            ({t.indexerLanguage})
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatAge(t.age)}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="flex items-start gap-4 border-t border-border px-5 py-4">
                      <div
                        className={cn(
                          "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
                          t.confidence >= 70
                            ? "bg-green-500/10 text-green-400"
                            : t.confidence >= 40
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {t.confidence}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
                          {t.title}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
                          {qLabel && (
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              <Monitor
                                size={12}
                                className="text-muted-foreground"
                              />
                              {qLabel}
                            </span>
                          )}
                          {sLabel && (
                            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                              <FilmIcon
                                size={12}
                                className="text-muted-foreground"
                              />
                              {sLabel}
                            </span>
                          )}
                          {t.size > 0 && (
                            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                              <HardDrive
                                size={12}
                                className="text-muted-foreground"
                              />
                              {formatBytes(t.size)}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          url && handleDownload(url, t.title)
                        }
                        disabled={!url || downloadTorrent.isPending}
                        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:scale-110 hover:text-foreground disabled:opacity-40"
                      >
                        <Download size={16} />
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-5 py-2.5 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ArrowUp
                          size={12}
                          className="text-muted-foreground"
                        />
                        {t.seeders} seeders
                      </span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ArrowDown
                          size={12}
                          className="text-muted-foreground"
                        />
                        {t.leechers} peers
                      </span>
                      {t.languages.length > 0 && (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Globe
                            size={12}
                            className="text-muted-foreground"
                          />
                          {t.languages
                            .map((l: string) => l.toUpperCase())
                            .join(", ")}
                        </span>
                      )}
                      {hasFreeleech && (
                        <span className="flex items-center gap-1.5 font-medium text-blue-400">
                          <Zap size={12} />
                          Freeleech
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center px-5 py-12 text-center">
              {advancedSearch && !committedQuery ? (
                <div>
                  <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Type a query and press Enter
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Search across all indexers with a custom query.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    No results found
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Check your indexer configuration in Prowlarr.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {(torrentPage > 0 || hasMore) && (
          <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-3">
            <span className="text-xs text-muted-foreground">
              Page {torrentPage + 1}
              {allFilteredTorrents.length > 0 && (
                <>
                  {" "}
                  &middot; {allFilteredTorrents.length} result
                  {allFilteredTorrents.length !== 1 ? "s" : ""}
                </>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={torrentPage === 0}
                onClick={() => setTorrentPage((p: number) => p - 1)}
              >
                <ChevronLeft size={16} />
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!hasMore}
                onClick={() => setTorrentPage((p: number) => p + 1)}
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
