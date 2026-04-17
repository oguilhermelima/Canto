"use client";

import Image from "next/image";
import { Rocket, Palette, MessageSquareQuote } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbBackdropLoader } from "~/lib/tmdb-image";
import type { ProfileStoryData } from "../use-profile-story";

function plural(n: number, word: string): string {
  return n === 1 ? `${n} ${word}` : `${n} ${word}s`;
}

function formatTime(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const days = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (days > 0) return h > 0 ? `${plural(days, "day")} and ${plural(h, "hour")}` : plural(days, "day");
  return plural(h, "hour");
}

function ratingLabel(avg: number): string {
  if (avg >= 8.5) return "Generous Critic";
  if (avg >= 7) return "Fair Judge";
  if (avg >= 5) return "Measured Viewer";
  return "Tough Crowd";
}

/* ─── Journey Opener — multiple backdrops fading into each other ─── */

export function JourneyOpener({ stats, insights }: ProfileStoryData): React.JSX.Element | null {
  // Fetch recent items for multiple backdrops
  const { data: recentMedia } = trpc.userMedia.getUserMedia.useQuery({
    limit: 5,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  if (!stats || stats.totalMinutes === 0) return null;

  const countryCount = insights?.countries.length ?? 0;
  const langCount = insights?.languages.length ?? 0;
  const backdrops = (recentMedia?.items ?? []).filter((i) => i.backdropPath).slice(0, 4);

  return (
    <section className="relative -mx-5 overflow-hidden md:-mx-8 lg:mx-0 lg:rounded-2xl">
      {/* Stacked backdrops with CSS mask cross-fade */}
      {backdrops.length > 0 ? (
        <div className="absolute inset-0">
          {backdrops.map((item, i) => {
            const n = backdrops.length;
            // Each image covers the full area, masked to reveal its horizontal segment
            // with generous overlap for smooth transitions
            const segStart = Math.max(0, (i / n) * 100 - 10);
            const fadeIn = (i / n) * 100;
            const fadeOut = ((i + 1) / n) * 100;
            const segEnd = Math.min(100, ((i + 1) / n) * 100 + 10);
            const mask = `linear-gradient(to right, transparent ${segStart}%, black ${fadeIn}%, black ${fadeOut}%, transparent ${segEnd}%)`;
            return (
              <div key={item.mediaId} className="absolute inset-0" style={{ WebkitMaskImage: mask, maskImage: mask }}>
                <Image
                  src={item.backdropPath!}
                  alt=""
                  fill
                  className="object-cover"
                  loader={tmdbBackdropLoader}
                  sizes="100vw"
                  style={{ opacity: 0.22 }}
                />
              </div>
            );
          })}
        </div>
      ) : stats.recentBackdrop ? (
        <Image src={stats.recentBackdrop} alt="" fill className="object-cover object-top opacity-20" loader={tmdbBackdropLoader} sizes="100vw" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/50 to-background" />

      <div className="relative px-5 py-7 sm:py-10 md:px-10 lg:px-6">
        <div className="mb-3 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-orange-400" />
          <span className="text-xs font-medium tracking-widest text-muted-foreground">THE JOURNEY</span>
        </div>

        <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {formatTime(stats.totalMinutes)}
        </p>
        <p className="mt-1 text-base text-muted-foreground sm:text-lg">
          of cinema and television
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {stats.movieCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.movieCount}</span> {stats.movieCount === 1 ? "movie" : "movies"}
            </span>
          )}
          {stats.showCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.showCount}</span> {stats.showCount === 1 ? "show" : "shows"}
            </span>
          )}
          {countryCount > 1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{countryCount}</span> countries
            </span>
          )}
          {langCount > 1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{langCount}</span> languages
            </span>
          )}
          {stats.completedThisYear > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.completedThisYear}</span> in {new Date().getFullYear()}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Taste ─── */

export function TasteNarrative({ genres, insights }: ProfileStoryData): React.JSX.Element | null {
  if (!genres || genres.length === 0) return null;

  const total = genres.reduce((s, g) => s + g.count, 0);
  const top = genres[0]!;
  const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
  const runners = genres.slice(1, 4).map((g) => g.genre);

  const topDecade = insights?.decadeDistribution[0];
  const decTotal = insights?.decadeDistribution.reduce((s, d) => s + d.count, 0) ?? 0;
  const topDecPct = topDecade && decTotal > 0 ? Math.round((topDecade.count / decTotal) * 100) : 0;

  return (
    <section className="py-2 lg:px-5">
      <div className="mb-2 flex items-center gap-2">
        <Palette className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-medium tracking-widest text-muted-foreground">TASTE</span>
      </div>

      <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {topPct >= 30 ? top.genre : "Eclectic"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {topPct >= 30
          ? <>{topPct}% of everything watched{runners.length > 0 && <>, followed by {runners.join(", ")}</>}</>
          : <>No single genre dominates{runners.length > 0 && <> — {top.genre}, {runners.join(", ")} lead the way</>}</>
        }
      </p>

      {topDecade && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sweet spot: the <span className="font-semibold text-foreground">{topDecade.decade}s</span>
          {topDecPct > 0 && ` (${topDecPct}%)`}
          {insights?.oldestTitle && <>. Oldest: <span className="text-foreground">{insights.oldestTitle.title}</span> ({insights.oldestTitle.year})</>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {genres.slice(0, 8).map((g, i) => (
          <span key={g.genre} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${i === 0 ? "bg-primary/15 font-medium text-primary" : "bg-white/[0.06] text-muted-foreground"}`}>
            {g.genre} <span className={i === 0 ? "text-primary" : "text-foreground"}>{g.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ─── Rating Voice ─── */

export function RatingVoice({ stats, dist, insights }: ProfileStoryData): React.JSX.Element | null {
  const totalRated = dist?.reduce((s, r) => s + r.count, 0) ?? 0;
  if (totalRated === 0) return null;

  const avg = stats?.averageRating;
  const maxCount = Math.max(...(dist?.map((r) => r.count) ?? [1]));
  const gem = insights?.hiddenGem;
  const unpop = insights?.unpopularOpinion;

  return (
    <section className="py-2 lg:px-5">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-medium tracking-widest text-muted-foreground">RATING VOICE</span>
      </div>

      <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {avg ? ratingLabel(avg) : `${totalRated} rated`}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {avg ? <>Averaging {avg.toFixed(1)}/10 across {totalRated} titles</> : null}
      </p>

      {/* Histogram */}
      {dist && dist.length > 0 && (
        <div className="mt-4 max-w-sm">
          <div className="flex items-end gap-[3px]" style={{ height: "40px" }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => {
              const count = dist.find((d) => d.rating === r)?.count ?? 0;
              const h = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 12 : 4) : 4;
              return (
                <div key={r} className={`flex-1 rounded-t transition-all duration-500 ${count > 0 ? "bg-primary/50" : "bg-white/[0.04]"}`} style={{ height: `${h}%` }} />
              );
            })}
          </div>
          <div className="mt-0.5 flex">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground">{i + 1}</span>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop cards */}
      {(gem?.backdropPath || unpop?.backdropPath) && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {gem?.backdropPath && (
            <div className="relative h-28 overflow-hidden rounded-xl sm:h-32">
              <Image src={gem.backdropPath} alt="" fill className="object-cover opacity-40" loader={tmdbBackdropLoader} sizes="50vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-3.5">
                <p className="text-[9px] font-medium tracking-widest text-emerald-400">HIDDEN GEM</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-white">{gem.title}</p>
                <p className="text-xs text-white/60">Rated <span className="font-bold text-emerald-400">{gem.userRating}/10</span> — world {gem.publicRating.toFixed(1)}</p>
              </div>
            </div>
          )}
          {unpop?.backdropPath && unpop.title !== gem?.title && (
            <div className="relative h-28 overflow-hidden rounded-xl sm:h-32">
              <Image src={unpop.backdropPath} alt="" fill className="object-cover opacity-40" loader={tmdbBackdropLoader} sizes="50vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-3.5">
                <p className="text-[9px] font-medium tracking-widest text-red-400">UNPOPULAR OPINION</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-white">{unpop.title}</p>
                <p className="text-xs text-white/60">Rated <span className="font-bold text-red-400">{unpop.userRating}/10</span> — world {unpop.publicRating.toFixed(1)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
