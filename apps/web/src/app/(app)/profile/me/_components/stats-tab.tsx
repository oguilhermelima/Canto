"use client";

import Image from "next/image";
import { Skeleton } from "@canto/ui/skeleton";
import { trpc } from "~/lib/trpc/client";
import { tmdbBackdropLoader, tmdbPosterLoader } from "~/lib/tmdb-image";
import type { ProfileStoryData } from "./use-profile-story";
import { useProfileStory } from "./use-profile-story";

const ACCENT = "text-amber-400";

function plural(n: number, word: string): string {
  return n === 1 ? `${n} ${word}` : `${n} ${word}s`;
}

function formatTime(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const days = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (days > 0)
    return h > 0 ? `${plural(days, "day")} and ${plural(h, "hour")}` : plural(days, "day");
  return plural(h, "hour");
}

function ratingLabel(avg: number): string {
  if (avg >= 8.5) return "Generous Critic";
  if (avg >= 7) return "Fair Judge";
  if (avg >= 5) return "Measured Viewer";
  return "Tough Crowd";
}

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

function Eyebrow({ label }: { label: string }): React.JSX.Element {
  return (
    <p className={`mb-3 font-mono text-[10px] uppercase tracking-[0.25em] md:text-[11px] ${ACCENT}`}>
      {label}
    </p>
  );
}

function JourneyBlock({ stats, insights }: ProfileStoryData): React.JSX.Element | null {
  const { data: recentMedia } = trpc.userMedia.getUserMedia.useQuery({
    limit: 4,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  if (!stats || stats.totalMinutes === 0) return null;

  const countryCount = insights?.countries.length ?? 0;
  const langCount = insights?.languages.length ?? 0;
  const backdrops = (recentMedia?.items ?? []).filter((i) => i.backdropPath).slice(0, 4);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/50">
      {backdrops.length > 0 && (
        <div className="absolute inset-0">
          {backdrops.map((item, i) => {
            const n = backdrops.length;
            const segStart = Math.max(0, (i / n) * 100 - 10);
            const fadeIn = (i / n) * 100;
            const fadeOut = ((i + 1) / n) * 100;
            const segEnd = Math.min(100, ((i + 1) / n) * 100 + 10);
            const mask = `linear-gradient(to right, transparent ${segStart}%, black ${fadeIn}%, black ${fadeOut}%, transparent ${segEnd}%)`;
            return (
              <div
                key={item.mediaId}
                className="absolute inset-0"
                style={{ WebkitMaskImage: mask, maskImage: mask }}
              >
                <Image
                  src={item.backdropPath!}
                  alt=""
                  fill
                  className="object-cover"
                  loader={tmdbBackdropLoader}
                  sizes="100vw"
                  style={{ opacity: 0.18 }}
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />

      <div className="relative p-6 md:p-10">
        <Eyebrow label="The Journey" />
        <p className="font-serif text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
          {formatTime(stats.totalMinutes)}
        </p>
        <p className="mt-2 font-serif text-lg italic text-muted-foreground md:text-xl">
          of cinema and television
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {stats.movieCount > 0 && (
            <span>
              <span className="text-foreground">{stats.movieCount}</span>{" "}
              {stats.movieCount === 1 ? "movie" : "movies"}
            </span>
          )}
          {stats.showCount > 0 && (
            <span>
              <span className="text-foreground">{stats.showCount}</span>{" "}
              {stats.showCount === 1 ? "show" : "shows"}
            </span>
          )}
          {countryCount > 1 && (
            <span>
              <span className="text-foreground">{countryCount}</span> countries
            </span>
          )}
          {langCount > 1 && (
            <span>
              <span className="text-foreground">{langCount}</span> languages
            </span>
          )}
          {stats.completedThisYear > 0 && (
            <span>
              <span className="text-foreground">{stats.completedThisYear}</span> in{" "}
              {new Date().getFullYear()}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function TasteBlock({ genres, insights }: ProfileStoryData): React.JSX.Element | null {
  if (!genres || genres.length === 0) return null;

  const total = genres.reduce((s, g) => s + g.count, 0);
  const top = genres[0]!;
  const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
  const runners = genres.slice(1, 4).map((g) => g.genre);

  const topDecade = insights?.decadeDistribution[0];
  const decTotal = insights?.decadeDistribution.reduce((s, d) => s + d.count, 0) ?? 0;
  const topDecPct =
    topDecade && decTotal > 0 ? Math.round((topDecade.count / decTotal) * 100) : 0;

  return (
    <section className="rounded-2xl border border-border/50 p-6 md:p-10">
      <Eyebrow label="Taste" />
      <p className="font-serif text-4xl leading-tight text-foreground md:text-5xl">
        {topPct >= 30 ? top.genre : "Eclectic"}
      </p>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
        {topPct >= 30 ? (
          <>
            {topPct}% of everything watched
            {runners.length > 0 && <>, followed by {runners.join(", ")}</>}
          </>
        ) : (
          <>
            No single genre dominates
            {runners.length > 0 && (
              <>
                {" "}
                — {top.genre}, {runners.join(", ")} lead the way
              </>
            )}
          </>
        )}
      </p>

      {topDecade && (
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Sweet spot: the{" "}
          <span className="font-semibold text-foreground">{topDecade.decade}s</span>
          {topDecPct > 0 && ` (${topDecPct}%)`}
          {insights.oldestTitle && (
            <>
              . Oldest:{" "}
              <span className="text-foreground">{insights.oldestTitle.title}</span> (
              {insights.oldestTitle.year})
            </>
          )}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-1.5">
        {genres.slice(0, 10).map((g, i) => (
          <span
            key={g.genre}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              i === 0
                ? "border-amber-400/30 bg-amber-400/[0.06] font-medium text-foreground"
                : "border-border bg-transparent text-muted-foreground"
            }`}
          >
            {g.genre}
            <span className="font-mono tabular-nums opacity-60">{g.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function RatingVoiceBlock({
  stats,
  dist,
  insights,
}: ProfileStoryData): React.JSX.Element | null {
  const totalRated = dist?.reduce((s, r) => s + r.count, 0) ?? 0;
  if (totalRated === 0) return null;

  const avg = stats?.averageRating;
  const maxCount = Math.max(...(dist?.map((r) => r.count) ?? [1]));
  const gem = insights?.hiddenGem;
  const unpop = insights?.unpopularOpinion;

  return (
    <section className="rounded-2xl border border-border/50 p-6 md:p-10">
      <Eyebrow label="Rating Voice" />
      <p className="font-serif text-4xl leading-tight text-foreground md:text-5xl">
        {avg ? ratingLabel(avg) : `${totalRated} rated`}
      </p>
      {avg && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-lg">
          Averaging {avg.toFixed(1)}/10 across {totalRated} titles
        </p>
      )}

      {dist && dist.length > 0 && (
        <div className="mt-6 max-w-md">
          <div className="flex items-end gap-[3px]" style={{ height: "56px" }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => {
              const count = dist.find((d) => d.rating === r)?.count ?? 0;
              const h =
                maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 12 : 4) : 4;
              return (
                <div
                  key={r}
                  className={`flex-1 rounded-sm transition-all duration-500 ${
                    count > 0 ? "bg-amber-400/70" : "bg-border/40"
                  }`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className="flex-1 text-center font-mono text-[10px] text-muted-foreground"
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      )}

      {(gem?.backdropPath || unpop?.backdropPath) && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {gem?.backdropPath && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl">
              <Image
                src={gem.backdropPath}
                alt=""
                fill
                className="object-cover opacity-50"
                loader={tmdbBackdropLoader}
                sizes="50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400">
                  Hidden gem
                </p>
                <p className="mt-1 font-serif text-lg leading-tight text-white md:text-xl">
                  {gem.title}
                </p>
                <p className="mt-1 font-mono text-[11px] text-white/70">
                  You <span className="font-bold text-amber-400">{gem.userRating}</span> · world{" "}
                  {gem.publicRating.toFixed(1)}
                </p>
              </div>
            </div>
          )}
          {unpop?.backdropPath && unpop.title !== gem?.title && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl">
              <Image
                src={unpop.backdropPath}
                alt=""
                fill
                className="object-cover opacity-50"
                loader={tmdbBackdropLoader}
                sizes="50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400">
                  Unpopular opinion
                </p>
                <p className="mt-1 font-serif text-lg leading-tight text-white md:text-xl">
                  {unpop.title}
                </p>
                <p className="mt-1 font-mono text-[11px] text-white/70">
                  You <span className="font-bold text-amber-400">{unpop.userRating}</span> · world{" "}
                  {unpop.publicRating.toFixed(1)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
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

function RecentDiaryBlock(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getRecentActivity.useQuery();

  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section className="rounded-2xl border border-border/50 p-6 md:p-10">
      <Eyebrow label="Recent diary" />
      <p className="mb-6 font-serif text-4xl leading-tight text-foreground md:text-5xl">
        The last few pages
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/40 pb-3">
              <Skeleton className="h-16 w-11 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col">
          {data?.map((item, idx) => (
            <li
              key={`${item.mediaId}-${String(item.updatedAt)}`}
              className={`flex items-center gap-4 py-3 ${
                idx < data.length - 1 ? "border-b border-border/40" : ""
              }`}
            >
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.posterPath && (
                  <Image
                    src={item.posterPath}
                    alt={item.title}
                    width={44}
                    height={64}
                    className="h-full w-full object-cover"
                    loader={tmdbPosterLoader}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-lg text-foreground">{item.title}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {describeAction(item)} · {formatRelativeTime(item.updatedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StatsTab(): React.JSX.Element {
  const story = useProfileStory();
  const { data: sectionData } = trpc.profileSection.list.useQuery();

  const enabledKeys = new Set(
    (sectionData?.sections ?? [])
      .filter((s) => s.enabled)
      .map((s) => s.sectionKey),
  );
  const isEnabled = (key: string): boolean =>
    !sectionData || enabledKeys.has(key);

  if (story.isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <Skeleton className="h-60 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {isEnabled("stats_dashboard") && <JourneyBlock {...story} />}
      {isEnabled("taste_map") && <TasteBlock {...story} />}
      {isEnabled("insights") && <RatingVoiceBlock {...story} />}
      <RecentDiaryBlock />
    </div>
  );
}
