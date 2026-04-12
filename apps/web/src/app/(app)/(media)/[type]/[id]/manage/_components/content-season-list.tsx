"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

export interface SeasonData {
  id: string;
  number: number;
  name: string | null;
  episodes: Array<{ id: string; number: number; title: string | null }>;
}

export interface FileItem {
  id: string;
  filePath: string;
  quality: string | null;
  source: string | null;
  sizeBytes: number | null;
}

function EmptyState({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <Download className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function ContentSeasonList({
  mediaType,
  seasons,
  loading,
  emptyText,
  getEpisodeItems,
  getMovieItems,
  renderFileRow,
  renderTorrentRow,
  seasonActions,
}: {
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  loading: boolean;
  emptyText: string;
  getEpisodeItems: (
    sn: number,
    en: number,
  ) => { files: FileItem[]; torrents: { id: string }[] };
  getMovieItems: () => { files: FileItem[]; torrents: { id: string }[] };
  renderFileRow: (f: FileItem) => React.ReactNode;
  renderTorrentRow: (t: { id: string }) => React.ReactNode;
  seasonActions: (sn: number) => React.ReactNode;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggle = (sn: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    );
  }

  if (mediaType === "movie") {
    const { files, torrents } = getMovieItems();
    if (!files.length && !torrents.length)
      return <EmptyState text={emptyText} />;
    return (
      <div className="space-y-2">
        {files.map((f) => (
          <div key={f.id} className="rounded-xl border border-border p-3">
            {renderFileRow(f)}
          </div>
        ))}
        {torrents.map((t) => (
          <div key={t.id} className="rounded-xl border border-border p-3">
            {renderTorrentRow(t)}
          </div>
        ))}
      </div>
    );
  }

  if (!seasons.length) return <EmptyState text={emptyText} />;

  return (
    <div className="space-y-2">
      {seasons.map((season) => {
        const isOpen = expanded.has(season.number);
        const eps = season.episodes;
        const epsWithData = eps.filter((ep) => {
          const { files, torrents } = getEpisodeItems(
            season.number,
            ep.number,
          );
          return files.length > 0 || torrents.length > 0;
        });

        return (
          <div key={season.id} className="rounded-xl border border-border">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(season.number)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(season.number);
                }
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {season.number === 0
                  ? "Specials"
                  : `Season ${season.number}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {epsWithData.length > 0
                  ? `${epsWithData.length}/${eps.length}`
                  : eps.length}{" "}
                episodes
              </span>
              <div
                className="ml-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {seasonActions(season.number)}
              </div>
            </div>
            {isOpen && eps.length > 0 && (
              <div className="border-t border-border">
                {eps.map((ep) => {
                  const { files, torrents } = getEpisodeItems(
                    season.number,
                    ep.number,
                  );
                  const hasData = files.length > 0 || torrents.length > 0;
                  return (
                    <div
                      key={ep.id}
                      className="border-b border-border/50 px-4 py-2.5 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-10 shrink-0 text-xs font-medium text-muted-foreground">
                          E{String(ep.number).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              hasData
                                ? "font-medium"
                                : "text-muted-foreground/40",
                            )}
                          >
                            {ep.title ?? `Episode ${ep.number}`}
                          </p>
                          {hasData && (
                            <div className="mt-1.5 space-y-1">
                              {files.map((f) => renderFileRow(f))}
                              {torrents.map((t) => renderTorrentRow(t))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
