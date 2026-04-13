"use client";

import Image from "next/image";
import { Skeleton } from "@canto/ui/skeleton";
import { Activity } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbPosterLoader } from "~/lib/tmdb-image";

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function describeAction(item: { status: string | null; rating: number | null }): string {
  if (item.rating && item.rating > 0) return `Rated ${item.rating}/10`;
  switch (item.status) {
    case "completed": return "Completed";
    case "watching": return "Started watching";
    case "planned": return "Added to watchlist";
    case "dropped": return "Dropped";
    default: return "Updated";
  }
}

export function RecentActivityBlock({ title: _title }: { title: string }): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getRecentActivity.useQuery();

  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section className="py-4 lg:px-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-green-400" />
        <span className="text-[11px] font-medium tracking-widest text-muted-foreground">RECENT ACTIVITY</span>
      </div>
      <p className="mb-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        What's been happening
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-14 w-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((item) => (
            <div key={`${item.mediaId}-${String(item.updatedAt)}`} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/30">
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                {item.posterPath ? (
                  <Image src={item.posterPath} alt={item.title} width={40} height={56} className="h-full w-full object-cover" loader={tmdbPosterLoader} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">?</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{describeAction(item)} · {formatRelativeTime(item.updatedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
