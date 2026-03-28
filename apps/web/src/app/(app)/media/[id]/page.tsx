"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@canto/ui/dialog";
import { Skeleton } from "@canto/ui/skeleton";
import { Download, Play } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import {
  MediaDetailHero,
  MediaDetailHeroSkeleton,
} from "~/components/media/media-detail-hero";
import { SeasonTabs } from "~/components/media/season-tabs";
import { CastSection } from "~/components/media/cast-section";
import { SimilarSection } from "~/components/media/similar-section";

interface MediaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MediaDetailPage({
  params,
}: MediaDetailPageProps): React.JSX.Element {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const [torrentDialogOpen, setTorrentDialogOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>();

  // Check if this is an external ID lookup
  const provider = searchParams.get("provider");
  const externalId = searchParams.get("externalId");
  const type = searchParams.get("type");

  const isExternal = id === "ext" && provider && externalId && type;

  // Fetch media by ID or by external ID
  const mediaById = trpc.media.getById.useQuery(
    { id },
    { enabled: !isExternal },
  );

  const mediaByExternal = trpc.media.getByExternal.useQuery(
    {
      provider: (provider ?? "tmdb") as "tmdb" | "anilist" | "tvdb",
      externalId: parseInt(externalId ?? "0", 10),
      type: (type ?? "movie") as "movie" | "show",
    },
    { enabled: !!isExternal },
  );

  const media = isExternal ? mediaByExternal.data : mediaById.data;
  const mediaLoading = isExternal ? mediaByExternal.isLoading : mediaById.isLoading;

  // Fetch extras (credits, similar, recommendations, videos, watch providers)
  const extras = trpc.media.getExtras.useQuery(
    { id: media?.id ?? "" },
    { enabled: !!media?.id },
  );

  // Torrent search
  const torrentSearch = trpc.torrent.search.useQuery(
    { mediaId: media?.id ?? "", seasonNumber: selectedSeason },
    { enabled: torrentDialogOpen && !!media?.id },
  );

  const downloadTorrent = trpc.torrent.download.useMutation();

  const handleDownload = (magnetUrl: string, title: string): void => {
    if (!media?.id) return;
    downloadTorrent.mutate({
      mediaId: media.id,
      magnetUrl,
      title,
    });
  };

  if (mediaLoading) {
    return <MediaDetailPageSkeleton />;
  }

  if (!media) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-black">
            Media not found
          </h2>
          <p className="text-neutral-500">
            The media you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  const credits = (extras.data?.credits?.cast ?? []).map((c) => ({
    id: String(c.id),
    name: c.name,
    character: c.character,
    profilePath: c.profilePath,
    order: c.order,
  }));

  const similar = (extras.data?.similar ?? []).map((s) => ({
    externalId: String(s.externalId),
    provider: s.provider,
    type: s.type as "movie" | "show",
    title: s.title,
    posterPath: s.posterPath ?? null,
    year: s.year,
    voteAverage: s.voteAverage,
  }));

  const recommendations = (extras.data?.recommendations ?? []).map((r) => ({
    externalId: String(r.externalId),
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  const videos = extras.data?.videos ?? [];
  const watchProvidersByRegion = extras.data?.watchProviders ?? {};
  const watchProviders = Object.values(watchProvidersByRegion)
    .flatMap((region) => [
      ...(region.flatrate ?? []),
      ...(region.rent ?? []),
      ...(region.buy ?? []),
    ])
    .filter(
      (p, i, arr) => arr.findIndex((x) => x.providerId === p.providerId) === i,
    );

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <MediaDetailHero
        id={media.id}
        type={media.type as "movie" | "show"}
        title={media.title}
        tagline={media.tagline}
        overview={media.overview}
        backdropPath={media.backdropPath}
        posterPath={media.posterPath}
        year={media.year}
        releaseDate={media.releaseDate}
        voteAverage={media.voteAverage}
        genres={media.genres ?? undefined}
        runtime={media.runtime}
        status={media.status}
        inLibrary={media.inLibrary}
        onDownloadClick={() => setTorrentDialogOpen(true)}
      />

      <div className="mx-auto max-w-screen-2xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        {/* Watch Providers */}
        {watchProviders.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-black">
              Streaming on
            </h2>
            <div className="flex flex-wrap gap-3">
              {watchProviders.map((wp) => (
                <div
                  key={wp.providerId}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2"
                >
                  {wp.logoPath && (
                    <img
                      src={`https://image.tmdb.org/t/p/w300${wp.logoPath}`}
                      alt={wp.providerName}
                      className="h-8 w-8 rounded"
                    />
                  )}
                  <span className="text-sm text-neutral-700">
                    {wp.providerName}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Videos / Trailers */}
        {videos.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-black">
              Videos
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.slice(0, 6).map((video) => (
                <a
                  key={video.id ?? video.key}
                  href={`https://www.youtube.com/watch?v=${video.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-video overflow-hidden rounded-xl bg-neutral-100"
                >
                  <img
                    src={`https://img.youtube.com/vi/${video.key}/hqdefault.jpg`}
                    alt={video.name ?? "Video"}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
                    <Play className="h-12 w-12 text-white" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-3">
                    <p className="line-clamp-1 text-sm font-medium text-white">
                      {video.name}
                    </p>
                    {video.type && (
                      <span className="mt-1 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
                        {video.type}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Cast */}
        <CastSection
          credits={credits}
          isLoading={extras.isLoading}
        />

        {/* Season tabs (TV shows only) */}
        {media.type === "show" && media.seasons && (
          <SeasonTabs
            seasons={media.seasons.map((s) => ({
              id: s.id,
              seasonNumber: s.number,
              name: s.name ?? `Season ${s.number}`,
              episodeCount: s.episodeCount,
              airDate: s.airDate,
              posterPath: s.posterPath,
              episodes: s.episodes?.map((e) => ({
                id: e.id,
                episodeNumber: e.number,
                title: e.title ?? `Episode ${e.number}`,
                overview: e.overview,
                stillPath: e.stillPath,
                airDate: e.airDate,
                runtime: e.runtime,
                voteAverage: e.voteAverage,
              })),
            }))}
          />
        )}

        {/* Similar & Recommended */}
        <SimilarSection
          similar={similar}
          recommendations={recommendations}
          isLoading={extras.isLoading}
        />
      </div>

      {/* Torrent search dialog */}
      <Dialog open={torrentDialogOpen} onOpenChange={setTorrentDialogOpen}>
        <DialogContent className="max-w-3xl border-neutral-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-black">Download {media.title}</DialogTitle>
            <DialogDescription className="text-neutral-500">
              Search for available downloads
            </DialogDescription>
          </DialogHeader>

          {/* Season selector for shows */}
          {media.type === "show" && media.seasons && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant={selectedSeason === undefined ? "default" : "outline"}
                size="sm"
                className={
                  selectedSeason === undefined
                    ? "bg-black text-white"
                    : "border-neutral-200 text-neutral-700"
                }
                onClick={() => setSelectedSeason(undefined)}
              >
                Full Series
              </Button>
              {media.seasons
                .filter((s) => s.number > 0)
                .sort((a, b) => a.number - b.number)
                .map((season) => (
                  <Button
                    key={season.number}
                    variant={
                      selectedSeason === season.number
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className={
                      selectedSeason === season.number
                        ? "bg-black text-white"
                        : "border-neutral-200 text-neutral-700"
                    }
                    onClick={() => setSelectedSeason(season.number)}
                  >
                    S{season.number.toString().padStart(2, "0")}
                  </Button>
                ))}
            </div>
          )}

          {/* Torrent results */}
          <div className="max-h-[400px] overflow-y-auto">
            {torrentSearch.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : torrentSearch.data && torrentSearch.data.length > 0 ? (
              <div className="space-y-2">
                {torrentSearch.data.map((torrent, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
                  >
                    <div className="flex-1 overflow-hidden pr-4">
                      <p className="truncate text-sm font-medium text-black">
                        {torrent.title}
                      </p>
                      <div className="mt-1 flex items-center gap-3">
                        {torrent.size && (
                          <span className="text-xs text-neutral-500">
                            {torrent.size}
                          </span>
                        )}
                        {torrent.seeders != null && (
                          <span className="text-xs text-green-600">
                            {torrent.seeders} seeds
                          </span>
                        )}
                        {torrent.leechers != null && (
                          <span className="text-xs text-red-500">
                            {torrent.leechers} peers
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 gap-1 bg-black text-white hover:bg-neutral-800"
                      onClick={() =>
                        torrent.magnetUrl && handleDownload(torrent.magnetUrl, torrent.title)
                      }
                      disabled={downloadTorrent.isPending}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-500">
                No torrents found. Try a different season or check your indexer
                configuration.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaDetailPageSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-white">
      <MediaDetailHeroSkeleton />
      <div className="mx-auto max-w-screen-2xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <section>
          <Skeleton className="mb-4 h-7 w-32" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[120px] shrink-0">
                <Skeleton className="mb-2 aspect-square w-full rounded-full" />
                <Skeleton className="mx-auto h-4 w-20" />
                <Skeleton className="mx-auto mt-1 h-3 w-16" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <Skeleton className="mb-4 h-7 w-48" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
