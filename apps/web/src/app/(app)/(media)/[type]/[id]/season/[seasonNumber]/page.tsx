"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EpisodeCard } from "@/components/media/episode-card";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function SeasonDetailPage(): React.JSX.Element {
  const params = useParams<{
    type: string;
    id: string;
    seasonNumber: string;
  }>();
  const router = useRouter();

  if (params.type !== "shows") notFound();

  const seasonNum = parseInt(params.seasonNumber, 10);

  const { data: resolvedData, isLoading } = trpc.media.resolve.useQuery({
    externalId: parseInt(params.id, 10),
    type: "show",
    provider: "tmdb",
  });

  const media = resolvedData?.media;
  const mediaId = resolvedData?.mediaId;

  const season = useMemo(
    () => media?.seasons.find((s: { number: number }) => s.number === seasonNum),
    [media?.seasons, seasonNum],
  );

  const episodes = useMemo(
    () => [...(season?.episodes ?? [])].sort((a: { number: number }, b: { number: number }) => a.number - b.number),
    [season?.episodes],
  );

  // User ratings for episode badges
  const { data: userRatings } = trpc.userMedia.getRatings.useQuery(
    { mediaId: mediaId! },
    { enabled: !!mediaId },
  );
  const userRatingMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!userRatings) return map;
    for (const r of userRatings) {
      if (r.episodeId) map.set(r.episodeId, r.rating);
    }
    return map;
  }, [userRatings]);

  // Computed season rating from episode averages
  const computedSeasonRating = useMemo(() => {
    if (!season?.id) return null;
    const epRatings = [...userRatingMap.values()];
    if (epRatings.length === 0) return null;
    const sum = epRatings.reduce((a, b) => a + b, 0);
    return Math.round((sum / epRatings.length) * 10) / 10;
  }, [season?.id, userRatingMap]);

  const sNum = String(seasonNum).padStart(2, "0");
  const seasonTitle = season?.name ?? `Season ${seasonNum}`;

  useDocumentTitle(
    season ? `${seasonTitle} — ${media?.title ?? "Show"}` : undefined,
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title={seasonTitle} />
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <Skeleton className="h-5 w-32" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full max-w-2xl" />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!media || !season) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="mb-2 text-base font-semibold text-foreground md:text-xl">Season not found</h2>
          <p className="text-sm text-muted-foreground">The season you&apos;re looking for doesn&apos;t exist.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push(`/shows/${params.id}`)}>
            Back to show
          </Button>
        </div>
      </div>
    );
  }

  const year = season.airDate ? new Date(season.airDate).getFullYear() : null;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title={seasonTitle}
        onNavigate={() => router.push(`/shows/${params.id}`)}
      />

      <div className="px-4 md:pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">

        {/* Season header */}
        <div className="mt-4 md:mt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">S{sNum}</span>
            <span className="text-muted-foreground">|</span>
            <span>{episodes.length} episodes</span>
            {year && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{year}</span>
              </>
            )}
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {seasonTitle}
          </h1>

          {season.overview && (
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
              {season.overview}
            </p>
          )}

          {/* Computed rating from episodes */}
          {computedSeasonRating !== null && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Star size={14} className="fill-yellow-500 text-yellow-500" />
              <span className="font-medium text-foreground">{computedSeasonRating}</span>
              <span>your average across {userRatingMap.size} rated episodes</span>
            </div>
          )}
        </div>

        {/* Episodes grid */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Episodes</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {episodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episode={{
                  id: ep.id,
                  episodeNumber: ep.number,
                  title: ep.title ?? `Episode ${ep.number}`,
                  overview: ep.overview,
                  stillPath: ep.stillPath,
                  airDate: ep.airDate,
                  runtime: ep.runtime,
                  voteAverage: ep.voteAverage,
                }}
                seasonNumber={seasonNum}
                showExternalId={params.id}
                userRating={userRatingMap.get(ep.id)}
                className="w-full"
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

