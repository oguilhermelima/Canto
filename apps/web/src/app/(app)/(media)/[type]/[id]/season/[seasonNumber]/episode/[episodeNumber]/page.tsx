"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Star } from "lucide-react";
import { Button } from "@canto/ui/button";
import { FadeImage } from "~/components/ui/fade-image";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";

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

  const season = useMemo(
    () => media?.seasons?.find((s: { number: number }) => s.number === seasonNum),
    [media?.seasons, seasonNum],
  );

  const episode = useMemo(
    () => season?.episodes?.find((e: { number: number }) => e.number === episodeNum),
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
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="mt-6 aspect-video w-full animate-pulse rounded-2xl bg-muted" />
          <div className="mt-6 space-y-3">
            <div className="h-8 w-96 max-w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-5 w-64 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
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
  const stillSrc = episode.stillPath?.startsWith("http")
    ? episode.stillPath
    : episode.stillPath
      ? `https://image.tmdb.org/t/p/w1280${episode.stillPath}`
      : null;

  const prevEpisode = season.episodes?.find(
    (e: { number: number }) => e.number === episodeNum - 1,
  );
  const nextEpisode = season.episodes?.find(
    (e: { number: number }) => e.number === episodeNum + 1,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        {/* Back link */}
        <Link
          href={`/shows/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {media.title}
        </Link>

        {/* Still image */}
        {stillSrc && (
          <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl bg-muted">
            <FadeImage
              src={stillSrc}
              alt={episode.title || `S${sNum}E${eNum}`}
              fill
              className="object-cover"
              fadeDuration={400}
              sizes="(max-width: 1024px) 100vw, 1024px"
              priority
            />
          </div>
        )}

        {/* Episode info */}
        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              S{sNum}E{eNum}
            </span>
            <span className="text-muted-foreground">|</span>
            <span>Season {seasonNum}</span>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {episode.title || `Episode ${episodeNum}`}
          </h1>

          {/* Metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {episode.airDate && (
              <div className="flex items-center gap-1.5">
                <Calendar size={14} />
                {new Date(episode.airDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            )}
            {episode.runtime != null && episode.runtime > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock size={14} />
                {episode.runtime}min
              </div>
            )}
            {episode.voteAverage != null && episode.voteAverage > 0 && (
              <div className="flex items-center gap-1.5">
                <Star size={14} className="fill-yellow-500 text-yellow-500" />
                {episode.voteAverage.toFixed(1)}
              </div>
            )}
          </div>

          {/* Overview */}
          {episode.overview && (
            <p className="mt-5 max-w-3xl leading-relaxed text-muted-foreground">
              {episode.overview}
            </p>
          )}
        </div>

        {/* Prev / Next navigation */}
        <div className="mt-8 flex items-center justify-between border-t border-border/30 pt-6">
          {prevEpisode ? (
            <Link
              href={`/shows/${params.id}/season/${seasonNum}/episode/${prevEpisode.number}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="text-xs text-muted-foreground/50">Previous</span>
              <p className="mt-0.5 font-medium text-foreground">
                E{String(prevEpisode.number).padStart(2, "0")} — {prevEpisode.title || `Episode ${prevEpisode.number}`}
              </p>
            </Link>
          ) : (
            <div />
          )}
          {nextEpisode ? (
            <Link
              href={`/shows/${params.id}/season/${seasonNum}/episode/${nextEpisode.number}`}
              className="text-right text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="text-xs text-muted-foreground/50">Next</span>
              <p className="mt-0.5 font-medium text-foreground">
                E{String(nextEpisode.number).padStart(2, "0")} — {nextEpisode.title || `Episode ${nextEpisode.number}`}
              </p>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}
