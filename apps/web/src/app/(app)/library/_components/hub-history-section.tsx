"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Clock3, Tv } from "lucide-react";
import { SectionTitle } from "@canto/ui/section-title";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { mediaHref } from "~/lib/media-href";
import type { LibraryPlaybackEntry } from "./library-playback-card";

function formatDateGroupLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today.getTime() - target.getTime();
  const dayMs = 86_400_000;

  if (diff < dayMs) return "Today";
  if (diff < dayMs * 2) return "Yesterday";
  if (diff < dayMs * 7) {
    return target.toLocaleDateString(undefined, { weekday: "long" });
  }
  return target.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: string | null): string {
  if (source === "jellyfin") return "Jellyfin";
  if (source === "plex") return "Plex";
  if (source === "manual" || !source) return "Manual";
  return source;
}

function episodeLabel(entry: LibraryPlaybackEntry): string | null {
  const ep = entry.episode;
  if (
    ep &&
    ep.seasonNumber !== null &&
    ep.number !== null
  ) {
    return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}${ep.title ? ` · ${ep.title}` : ""}`;
  }
  if (ep?.title) return ep.title;
  return null;
}

function statusColor(entry: LibraryPlaybackEntry): string {
  if (entry.isCompleted === true || (entry.progressPercent ?? 0) >= 100) {
    return "bg-emerald-500";
  }
  if (entry.entryType === "playback" && entry.isCompleted === false) {
    return "bg-amber-500";
  }
  return "bg-muted-foreground";
}

function posterUrl(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w185${path}`;
}

interface DateGroup {
  label: string;
  entries: LibraryPlaybackEntry[];
}

function CompactHistoryEntry({
  entry,
}: {
  entry: LibraryPlaybackEntry;
}): React.JSX.Element {
  const epLabel = episodeLabel(entry);
  const watchedAt = new Date(entry.watchedAt);

  return (
    <Link
      href={mediaHref(entry.provider, entry.externalId, entry.mediaType)}
      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
    >
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {entry.posterPath ? (
          <Image
            src={posterUrl(entry.posterPath)}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {entry.mediaType === "show" ? (
              <Tv className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor(entry))} />
          <p className="truncate text-sm font-medium text-foreground">
            {entry.title}
          </p>
        </div>
        {epLabel && (
          <p className="mt-0.5 truncate pl-3.5 text-xs text-muted-foreground">
            {epLabel}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="h-3 w-3" />
        <span>{formatTime(watchedAt)}</span>
        <span className="text-muted-foreground">·</span>
        <span>{sourceLabel(entry.source)}</span>
      </div>
    </Link>
  );
}

export function HubHistorySection(): React.JSX.Element {
  const { data, isLoading, isError, refetch } =
    trpc.userMedia.getLibraryHistory.useQuery({ limit: 8 });

  const entries = useMemo(
    () => (data?.items ?? []) as LibraryPlaybackEntry[],
    [data?.items],
  );

  const groups = useMemo((): DateGroup[] => {
    const result: DateGroup[] = [];
    for (const entry of entries) {
      const label = formatDateGroupLabel(new Date(entry.watchedAt));
      const last = result[result.length - 1];
      if (last && last.label === label) {
        last.entries.push(entry);
      } else {
        result.push({ label, entries: [entry] });
      }
    }
    return result;
  }, [entries]);

  if (isLoading) {
    return (
      <section>
        <SectionTitle title="Recent Activity" seeMorePath="/library/history" linkAs={Link} />
        <div className="mt-2 space-y-2 px-4 md:mt-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[72px] animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            Failed to load recent activity.
          </p>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-foreground hover:text-foreground"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section>
        <SectionTitle title="Recent Activity" />
        <div className="mt-2 rounded-2xl px-4 md:mt-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 border border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          No activity in the log yet. Your journey through the stars begins with
          the first play.
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle title="Recent Activity" seeMorePath="/library/history" linkAs={Link} />

      <div className="mt-2 space-y-5 px-4 md:mt-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <div className="rounded-xl border border-border bg-muted/20">
              {group.entries.map((entry, i) => (
                <div key={entry.id}>
                  {i > 0 && (
                    <div className="mx-2 border-t border-border" />
                  )}
                  <CompactHistoryEntry entry={entry} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
