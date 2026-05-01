"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, Star } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { tmdbBackdropLoader, tmdbPosterLoader } from "@/lib/tmdb-image";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";
import { mediaHref } from "@/lib/media-href";

const TMDB_LOGO = "https://image.tmdb.org/t/p/w500";
const ACCENT = "text-amber-400";

type MediaItem = {
  mediaId: string;
  externalId: number;
  provider: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  rating: number | null;
  stateUpdatedAt: Date;
  status: string | null;
};

function Eyebrow({ label }: { label: string }): React.JSX.Element {
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.25em] md:text-[11px] ${ACCENT}`}>
      {label}
    </p>
  );
}

function ThisYearHero({
  stats,
  topGenre,
  posters,
}: {
  stats: { completedThisYear: number; averageRating: number | null; totalMinutes: number };
  topGenre: string | null;
  posters: MediaItem[];
}): React.JSX.Element | null {
  if (!stats.completedThisYear) return null;
  const year = new Date().getFullYear();
  const bg = posters.find((p) => p.backdropPath);

  return (
    <section className="relative -mx-5 overflow-hidden rounded-none md:-mx-8 md:rounded-2xl lg:mx-0">
      {bg?.backdropPath && (
        <div className="absolute inset-0">
          <Image
            src={bg.backdropPath}
            alt=""
            fill
            className="object-cover opacity-30"
            loader={tmdbBackdropLoader}
            sizes="100vw"
          />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-400/[0.08] via-background/60 to-background/90" />
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:gap-10 md:p-10 lg:p-14">
        <div className="flex-1">
          <Eyebrow label={`${year} in progress`} />
          <div className="mt-4 flex items-baseline gap-4">
            <span className="font-serif text-7xl leading-none tracking-tight text-foreground md:text-8xl lg:text-9xl">
              {stats.completedThisYear}
            </span>
            <span className="font-serif text-xl italic text-muted-foreground md:text-2xl">
              titles closed
            </span>
          </div>
          <p className="mt-5 max-w-2xl font-serif text-lg italic leading-snug text-muted-foreground md:text-xl">
            {topGenre && (
              <>
                Mostly <span className="text-amber-400">{topGenre}</span>
              </>
            )}
            {stats.averageRating !== null && stats.averageRating > 0 && (
              <>
                {topGenre && " · "}
                averaging{" "}
                <span className="font-mono not-italic tabular-nums text-foreground">
                  {stats.averageRating.toFixed(1)}
                </span>
              </>
            )}
            {stats.totalMinutes > 0 && (
              <>
                {" · "}
                <span className="font-mono not-italic tabular-nums text-foreground">
                  {Math.floor(stats.totalMinutes / 60)}h
                </span>{" "}
                on screen
              </>
            )}
          </p>
        </div>
        {posters.length > 0 && (
          <div className="flex shrink-0 gap-2 md:-mr-4">
            {posters.slice(0, 3).map((item, i) => (
              <div
                key={item.mediaId}
                className="relative h-28 w-20 overflow-hidden rounded-lg shadow-2xl md:h-40 md:w-28"
                style={{
                  transform: `rotate(${(i - 1) * 3}deg)`,
                  marginLeft: i === 0 ? 0 : "-12px",
                  zIndex: 3 - i,
                }}
              >
                {item.posterPath && (
                  <Image
                    src={item.posterPath}
                    alt=""
                    fill
                    className="object-cover"
                    loader={tmdbPosterLoader}
                    sizes="120px"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LatelyOnScreen({ items }: { items: MediaItem[] }): React.JSX.Element | null {
  const { containerRef, handleScroll } = useScrollCarousel({ scrollFraction: 0.9 });
  if (items.length < 3) return null;
  return (
    <section>
      <div className="mb-3">
        <Eyebrow label="Lately on screen" />
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
      >
        {items.map((item) => (
          <Link
            key={item.mediaId}
            href={mediaHref(item.provider, item.externalId, item.mediaType)}
            className="group relative block h-[138px] w-[92px] shrink-0 overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-80 md:h-[174px] md:w-[116px]"
            title={item.title}
          >
            {item.posterPath && (
              <Image
                src={item.posterPath}
                alt={item.title}
                fill
                className="object-cover"
                loader={tmdbPosterLoader}
                sizes="116px"
              />
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function CurrentlyWatching({ items }: { items: MediaItem[] }): React.JSX.Element | null {
  const { containerRef, handleScroll } = useScrollCarousel({ scrollFraction: 0.8 });
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-4">
        <Eyebrow label="Currently watching" />
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-none"
      >
        {items.map((item) => {
          const backdrop = item.backdropPath ?? item.posterPath;
          return (
            <Link
              key={item.mediaId}
              href={mediaHref(item.provider, item.externalId, item.mediaType)}
              className="group relative aspect-video w-[320px] shrink-0 overflow-hidden rounded-xl bg-muted md:w-[360px] lg:w-[400px]"
            >
              {backdrop && (
                <Image
                  src={backdrop}
                  alt={item.title}
                  fill
                  className={`object-cover transition-transform duration-500 group-hover:scale-[1.03] ${
                    !item.backdropPath ? "blur-sm" : ""
                  }`}
                  loader={tmdbBackdropLoader}
                  sizes="400px"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  {item.logoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- TMDB logos vary in size
                    <img
                      src={`${TMDB_LOGO}${item.logoPath}`}
                      alt={item.title}
                      className="max-h-10 max-w-[80%] object-contain drop-shadow-lg"
                    />
                  ) : (
                    <p className="line-clamp-2 font-serif text-xl leading-tight text-white drop-shadow-lg">
                      {item.title}
                    </p>
                  )}
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
                    {item.mediaType === "show" ? "Series" : "Film"}
                    {item.year && ` · ${item.year}`}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 text-black opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HallOfFame({ items }: { items: MediaItem[] }): React.JSX.Element | null {
  const top = [...items]
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, 4);
  if (top.length === 0) return null;
  return (
    <section>
      <div className="mb-4">
        <Eyebrow label="Hall of fame" />
        <p className="mt-1 font-serif text-2xl text-foreground md:text-3xl">
          The canon, personally curated
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {top.map((item) => (
          <Link
            key={item.mediaId}
            href={mediaHref(item.provider, item.externalId, item.mediaType)}
            className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-amber-400/10 transition-all hover:ring-2 hover:ring-amber-400/40"
          >
            {item.posterPath && (
              <Image
                src={item.posterPath}
                alt={item.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                loader={tmdbPosterLoader}
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            )}
            {(item.rating ?? 0) > 0 && (
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-400 backdrop-blur">
                <Star className="h-2.5 w-2.5 fill-current" />
                {item.rating}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function OnDeck({ items }: { items: MediaItem[] }): React.JSX.Element | null {
  const top = items.slice(0, 6);
  if (top.length === 0) return null;
  return (
    <section>
      <div className="mb-4">
        <Eyebrow label="On deck" />
        <p className="mt-1 font-serif text-2xl text-foreground md:text-3xl">
          Up next in the queue
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 md:gap-4">
        {top.map((item) => (
          <Link
            key={item.mediaId}
            href={mediaHref(item.provider, item.externalId, item.mediaType)}
            className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-shadow hover:ring-2 hover:ring-foreground/20"
          >
            {item.posterPath && (
              <Image
                src={item.posterPath}
                alt={item.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                loader={tmdbPosterLoader}
                sizes="(max-width: 768px) 33vw, 15vw"
              />
            )}
          </Link>
        ))}
      </div>
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

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RecentDiary({ items }: { items: MediaItem[] }): React.JSX.Element | null {
  const top = items.slice(0, 4);
  if (top.length === 0) return null;
  return (
    <section>
      <div className="mb-4">
        <Eyebrow label="Recent diary" />
        <p className="mt-1 font-serif text-2xl text-foreground md:text-3xl">
          What&apos;s been happening
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {top.map((item) => {
          const backdrop = item.backdropPath ?? item.posterPath;
          return (
            <Link
              key={`${item.mediaId}-${String(item.stateUpdatedAt)}`}
              href={mediaHref(item.provider, item.externalId, item.mediaType)}
              className="group relative aspect-[21/9] w-full overflow-hidden rounded-xl bg-muted"
            >
              {backdrop && (
                <Image
                  src={backdrop}
                  alt={item.title}
                  fill
                  className={`object-cover transition-transform duration-500 group-hover:scale-[1.02] ${
                    !item.backdropPath ? "blur-sm" : ""
                  }`}
                  loader={tmdbBackdropLoader}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/20" />
              <div className="relative flex h-full flex-col justify-between p-4 md:p-5">
                <p className={`font-mono text-[10px] uppercase tracking-[0.2em] ${ACCENT}`}>
                  {describeAction(item)}
                </p>
                <div>
                  <p className="line-clamp-1 font-serif text-lg leading-tight text-white md:text-xl">
                    {item.title}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/60">
                    {formatRelativeTime(item.stateUpdatedAt)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function PublicOverviewTab({ userId }: { userId: string }): React.JSX.Element {
  const { data: overview, isLoading: overviewLoading } =
    trpc.publicProfile.getOverview.useQuery({ id: userId });
  const { data: sectionData } = trpc.publicProfile.getSections.useQuery({ id: userId });

  if (overviewLoading || !overview) {
    return (
      <div className="flex flex-col gap-10 py-4 md:gap-14">
        <Skeleton className="h-60 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const enabledKeys = new Set(
    (sectionData?.sections ?? [])
      .filter((s) => s.enabled)
      .map((s) => s.sectionKey),
  );
  const isEnabled = (key: string): boolean =>
    !sectionData || enabledKeys.has(key);

  const topGenre = overview.genres[0]?.genre ?? null;

  return (
    <div className="flex flex-col gap-10 py-4 md:gap-14">
      {isEnabled("year_in_progress") && (
        <ThisYearHero
          stats={{
            completedThisYear: overview.stats.completedThisYear,
            averageRating: overview.stats.averageRating,
            totalMinutes: overview.stats.totalMinutes,
          }}
          topGenre={topGenre}
          posters={overview.recentCompleted as MediaItem[]}
        />
      )}
      {isEnabled("recent_completions") && (
        <LatelyOnScreen items={overview.recentCompleted as MediaItem[]} />
      )}
      {isEnabled("currently_watching") && (
        <CurrentlyWatching items={overview.watching as MediaItem[]} />
      )}
      {isEnabled("top_favorites") && (
        <HallOfFame items={overview.favorites as MediaItem[]} />
      )}
      {isEnabled("watchlist_launchpad") && (
        <OnDeck items={overview.planned as MediaItem[]} />
      )}
      {isEnabled("recent_activity") && (
        <RecentDiary items={overview.recentAny as MediaItem[]} />
      )}
    </div>
  );
}
