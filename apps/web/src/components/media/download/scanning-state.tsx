"use client";

import { Satellite } from "lucide-react";

interface IndexerChipData {
  id: string;
  name: string;
  status: "pending" | "success" | "error";
  count: number;
  tookMs: number | null;
  errorMessage: string | null;
}

interface ScanningStateProps {
  mediaTitle: string;
  torrentSearchContext: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null;
  advancedSearch: boolean;
  committedQuery: string;
  indexers: IndexerChipData[];
}

export function ScanningState({
  mediaTitle,
  torrentSearchContext,
  advancedSearch,
  committedQuery,
  indexers,
}: ScanningStateProps): React.JSX.Element {
  const summary = buildSearchSummary(
    mediaTitle,
    torrentSearchContext,
    advancedSearch,
    committedQuery,
  );

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-8 px-5 py-12">
      {/* Radar pulse */}
      <div className="relative flex h-44 w-44 items-center justify-center">
        <div
          className="absolute h-44 w-44 animate-ping rounded-full border border-primary/20"
          style={{ animationDuration: "3s" }}
        />
        <div
          className="absolute h-32 w-32 animate-ping rounded-full border border-primary/30"
          style={{ animationDuration: "3s", animationDelay: "0.6s" }}
        />
        <div
          className="absolute h-20 w-20 animate-ping rounded-full border border-primary/40"
          style={{ animationDuration: "3s", animationDelay: "1.2s" }}
        />
        <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <Satellite
            size={26}
            className="animate-pulse text-primary"
            style={{ animationDuration: "1.6s" }}
          />
        </div>
      </div>

      {/* Copy */}
      <div className="max-w-md text-center">
        <p className="text-base font-semibold text-foreground">
          Pinging the cosmos
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sweeping every connected indexer for
        </p>
        <p className="mt-1.5 inline-block max-w-full truncate rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-foreground">
          {summary}
        </p>
      </div>

      {/* Per-indexer chips */}
      {indexers.length > 0 && (
        <div className="flex max-w-md flex-wrap items-center justify-center gap-2">
          {indexers.map((idx) => (
            <IndexerChip key={idx.id} indexer={idx} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        First contact may take a few seconds.
      </p>
    </div>
  );
}

function buildSearchSummary(
  mediaTitle: string,
  ctx: { seasonNumber?: number; episodeNumbers?: number[] } | null,
  advancedSearch: boolean,
  committedQuery: string,
): string {
  if (advancedSearch && committedQuery) return committedQuery;
  if (ctx?.seasonNumber === undefined) return mediaTitle;
  const ss = String(ctx.seasonNumber).padStart(2, "0");
  const eps = ctx.episodeNumbers ?? [];
  if (eps.length === 0) return `${mediaTitle} · S${ss}`;
  if (eps.length === 1) {
    return `${mediaTitle} · S${ss}E${String(eps[0]).padStart(2, "0")}`;
  }
  const sorted = [...eps].sort((a, b) => a - b);
  const first = String(sorted[0]).padStart(2, "0");
  const last = String(sorted[sorted.length - 1]).padStart(2, "0");
  return `${mediaTitle} · S${ss}E${first}–E${last}`;
}

function IndexerChip({
  indexer,
}: {
  indexer: IndexerChipData;
}): React.JSX.Element {
  const seconds =
    indexer.tookMs !== null ? (indexer.tookMs / 1000).toFixed(1) : null;

  if (indexer.status === "success") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
        title={
          indexer.count === 0
            ? `${indexer.name} returned no results`
            : `${indexer.name} returned ${indexer.count} result${indexer.count === 1 ? "" : "s"} in ${seconds}s`
        }
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        {indexer.name}
        <span className="text-primary">
          {indexer.count} · {seconds}s
        </span>
      </span>
    );
  }

  if (indexer.status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive"
        title={indexer.errorMessage ?? `${indexer.name} failed`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        {indexer.name}
        <span className="text-destructive">failed</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
      {indexer.name}
      <span className="text-muted-foreground">scanning…</span>
    </span>
  );
}
