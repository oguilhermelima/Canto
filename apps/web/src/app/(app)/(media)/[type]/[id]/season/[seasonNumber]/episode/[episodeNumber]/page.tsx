"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { TitleBar } from "~/components/layout/titlebar";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { EpisodeInfo } from "./_components/episode-info";
import { EpisodeHero } from "./_components/episode-hero";
import { EpisodeReviewsSection } from "./_components/episode-reviews-section";
import { EpisodeCreditsSection } from "./_components/episode-credits-section";
import { EpisodePrevNextNav } from "./_components/episode-prev-next-nav";

export default function EpisodeDetailPage(): React.JSX.Element {
  const params = useParams<{
    type: string;
    id: string;
    seasonNumber: string;
    episodeNumber: string;
  }>();
  const router = useRouter();

  if (params.type !== "shows") notFound();

  const seasonNum = parseInt(params.seasonNumber, 10);
  const episodeNum = parseInt(params.episodeNumber, 10);

  const { data: resolvedData, isLoading } = trpc.media.resolve.useQuery({
    externalId: parseInt(params.id, 10),
    type: "show",
    provider: "tmdb",
  });

  const media = resolvedData?.media;
  const mediaId = resolvedData?.mediaId;

  const season = useMemo(
    () => media?.seasons.find((s) => s.number === seasonNum),
    [media?.seasons, seasonNum],
  );

  const episode = useMemo(
    () => season?.episodes.find((e) => e.number === episodeNum),
    [season?.episodes, episodeNum],
  );

  useDocumentTitle(
    episode?.title
      ? `${episode.title} — ${media?.title ?? "Show"}`
      : undefined,
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TitleBar title="" />
        <div className="relative -mt-16 min-h-[55vh] w-full bg-gradient-to-b from-muted/20 to-background max-md:mt-0 max-md:min-h-0">
          <Skeleton className="absolute inset-0 max-md:relative max-md:aspect-video" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 via-30% to-transparent max-md:hidden" />
          <div className="relative mx-auto flex min-h-[55vh] w-full flex-col justify-end px-4 pb-10 pt-24 max-md:hidden md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-10 w-96 max-w-full" />
            <Skeleton className="mt-3 h-5 w-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!media || !season || !episode) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="mb-2 text-base font-semibold text-foreground md:text-xl">
            Episode not found
          </h2>
          <p className="text-sm text-muted-foreground">
            The episode you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/shows/${params.id}`)}
          >
            Back to show
          </Button>
        </div>
      </div>
    );
  }

  const sNum = String(seasonNum).padStart(2, "0");
  const eNum = String(episodeNum).padStart(2, "0");
  const showHref = `/shows/${params.id}`;

  const prev = season.episodes.find((e) => e.number === episodeNum - 1);
  const next = season.episodes.find((e) => e.number === episodeNum + 1);

  return (
    <div className="min-h-screen bg-background">
      <TitleBar title={media.title} onNavigate={() => router.push(showHref)} />

      <EpisodeHero
        stillSrc={episode.stillPath ?? null}
        showHref={showHref}
        showTitle={media.title}
        episode={episode}
        sNum={sNum}
        eNum={eNum}
        seasonNum={seasonNum}
      />

      <div className="px-4 pt-5 md:hidden">
        <EpisodeInfo episode={episode} sNum={sNum} eNum={eNum} seasonNum={seasonNum} variant="body" />
      </div>

      <div className="px-4 pb-12 pt-6 md:px-8 md:pt-0 lg:px-12 xl:px-16 2xl:px-24">
        {episode.overview && (
          <p className="max-w-3xl leading-relaxed text-muted-foreground">
            {episode.overview}
          </p>
        )}

        {episode.guestStars && episode.guestStars.length > 0 && (
          <EpisodeCreditsSection title="Guest Stars" people={episode.guestStars} showCharacter />
        )}

        {episode.crew && episode.crew.length > 0 && (
          <EpisodeCreditsSection title="Crew" people={episode.crew} />
        )}

        {episode.id && mediaId && season.id && (
          <EpisodeReviewsSection
            episodeId={episode.id}
            mediaId={mediaId}
            seasonId={season.id}
            showExternalId={params.id}
          />
        )}

        <EpisodePrevNextNav
          showExternalId={params.id}
          seasonNum={seasonNum}
          prev={prev ? { number: prev.number, title: prev.title } : undefined}
          next={next ? { number: next.number, title: next.title } : undefined}
        />
      </div>
    </div>
  );
}
