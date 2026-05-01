"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play, Star } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { tmdbBackdropLoader, tmdbPosterLoader } from "@/lib/tmdb-image";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";
import { mediaHref } from "@/lib/media-href";

const TMDB_LOGO = "https://image.tmdb.org/t/p/w500";
const ACCENT = "text-amber-400";

function Eyebrow({ label }: { label: string }): React.JSX.Element {
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.25em] md:text-[11px] ${ACCENT}`}>
      {label}
    </p>
  );
}

/* ─── Year in progress — first hero of the page ─── */

function ThisYearHero(): React.JSX.Element | null {
  const { data: stats } = trpc.userMedia.getWatchTimeStats.useQuery();
  const { data: genres } = trpc.userMedia.getTopGenres.useQuery();
  const { data: recent } = trpc.userMedia.getUserMedia.useQuery({
    status: "completed",
    limit: 3,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  if (!stats || !stats.completedThisYear || stats.completedThisYear === 0) return null;

  const year = new Date().getFullYear();
  const top = genres?.[0];
  const bg = recent?.items.find((i) => i.backdropPath);

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
            {top && (
              <>
                Mostly <span className="text-amber-400">{top.genre}</span>
              </>
            )}
            {stats.averageRating !== null && stats.averageRating > 0 && (
              <>
                {top && " · "}
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
          <Link
            href="/profile/me?tab=stats"
            className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Open year in review <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recent && recent.items.length > 0 && (
          <div className="flex shrink-0 gap-2 md:-mr-4">
            {recent.items.slice(0, 3).map((item, i) => (
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

/* ─── Recent completions filmstrip — decorative thin strip ─── */

function RecentCompletionsFilmstrip(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    status: "completed",
    limit: 24,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  const { containerRef, handleScroll } = useScrollCarousel({ scrollFraction: 0.9 });

  if (!isLoading && (!data?.items || data.items.length < 3)) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow label="Lately on screen" />
        <Link
          href="/profile/me?tab=library&filter=completed"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          All completed <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
      >
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-[138px] w-[92px] shrink-0 rounded-md md:h-[174px] md:w-[116px]" />
            ))
          : data?.items.map((item) => (
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
                    sizes="84px"
                  />
                )}
              </Link>
            ))}
      </div>
    </section>
  );
}

/* ─── Currently watching — backdrop carousel ─── */

function CurrentlyWatchingCarousel(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    status: "watching",
    limit: 12,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  const { containerRef, handleScroll } = useScrollCarousel({ scrollFraction: 0.8 });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <Eyebrow label="Currently watching" />
        <Link
          href="/profile/me?tab=library&filter=watching"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          All watching <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto overflow-y-visible pb-2 scrollbar-none"
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-video w-[320px] shrink-0 rounded-xl md:w-[360px] lg:w-[400px]"
              />
            ))
          : data?.items.map((item) => {
              const href = mediaHref(item.provider, item.externalId, item.mediaType);
              const backdrop = item.backdropPath ?? item.posterPath;
              return (
                <Link
                  key={item.mediaId}
                  href={href}
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

/* ─── Hall of Fame — 4 large favorite tiles ─── */

function HallOfFame(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    isFavorite: true,
    limit: 50,
    sortBy: "rating",
    sortOrder: "desc",
  });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  const items = [...(data?.items ?? [])]
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, 4);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <Eyebrow label="Hall of fame" />
          <p className="mt-1 font-serif text-2xl text-foreground md:text-3xl">
            The canon, personally curated
          </p>
        </div>
        <Link
          href="/profile/me?tab=library&filter=favorites"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          All favorites <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
            ))
          : items.map((item) => (
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
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-2 font-serif text-sm text-white md:text-base">
                    {item.title}
                  </p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}

/* ─── On deck — small poster grid ─── */

function OnDeck(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    status: "planned",
    limit: 6,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  const items = (data?.items ?? []).slice(0, 6);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <Eyebrow label="On deck" />
          <p className="mt-1 font-serif text-2xl text-foreground md:text-3xl">
            Up next in the queue
          </p>
        </div>
        <Link
          href="/profile/me?tab=library&filter=planned"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          All planned <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 md:gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
            ))
          : items.map((item) => (
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

/* ─── Recent diary — backdrop cards ─── */

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

function RecentDiary(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    limit: 4,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  const items = data?.items ?? [];

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <Eyebrow label="Recent diary" />
          <p className="mt-1 font-serif text-2xl text-foreground md:text-3xl">
            What&apos;s been happening
          </p>
        </div>
        <Link
          href="/profile/me?tab=stats"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Full stats <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[21/9] w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
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
      )}
    </section>
  );
}

/* ─── Composition ─── */

const SECTIONS: Array<{ key: string; Section: React.ComponentType }> = [
  { key: "year_in_progress", Section: ThisYearHero },
  { key: "recent_completions", Section: RecentCompletionsFilmstrip },
  { key: "currently_watching", Section: CurrentlyWatchingCarousel },
  { key: "top_favorites", Section: HallOfFame },
  { key: "watchlist_launchpad", Section: OnDeck },
  { key: "recent_activity", Section: RecentDiary },
];

export function OverviewTab(): React.JSX.Element {
  const { data: sectionData } = trpc.profileSection.list.useQuery();
  const enabledKeys = new Set(
    (sectionData?.sections ?? [])
      .filter((s) => s.enabled)
      .map((s) => s.sectionKey),
  );
  const visible = sectionData
    ? SECTIONS.filter((s) => enabledKeys.has(s.key))
    : SECTIONS;

  return (
    <div className="flex flex-col gap-10 py-4 md:gap-14">
      {visible.map(({ key, Section }, i) => (
        <div
          key={key}
          className="animate-section-rise"
          style={{ animationDelay: `${Math.min(i, 3) * 50}ms` }}
        >
          <Section />
        </div>
      ))}
    </div>
  );
}
