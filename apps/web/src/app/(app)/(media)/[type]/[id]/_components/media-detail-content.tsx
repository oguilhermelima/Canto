"use client";

import Image from "next/image";
import Link from "next/link";
import {
  MediaDetailHero,
  MediaDetailHeroSkeleton,
} from "~/components/media/media-detail-hero";
import { CastSection } from "~/components/media/cast-section";
import { SimilarSection } from "~/components/media/similar-section";
import { ManageModal } from "~/components/media/manage/manage-modal";
import { DownloadModal } from "~/components/media/download/download-modal";
import { useMediaDetail } from "./use-media-detail";
import { AdminActions } from "./admin-actions";
import { RequestSection } from "./request-section";
import { VideoCarouselSection } from "./video-carousel";
import { SeasonsSection } from "./seasons-section";
import { MediaReviewSection } from "./media-review-section";
import { RemoveDialog } from "./remove-dialog";

interface MediaDetailContentProps {
  id: string;
  mediaType: "movie" | "show";
}

export function MediaDetailContent({
  id,
  mediaType,
}: MediaDetailContentProps): React.JSX.Element {
  const detail = useMediaDetail(id, mediaType);

  if (detail.mediaLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MediaDetailHeroSkeleton />
      </div>
    );
  }

  if (!detail.media) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="mb-2 text-base font-semibold text-foreground md:text-xl">
            Media not found
          </h2>
          <p className="text-muted-foreground">
            The media you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  const { media } = detail;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile logo */}
      <div className="relative z-10 flex h-16 items-center px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/canto.svg"
            alt="Canto"
            width={36}
            height={36}
            className="h-9 w-9 dark:invert"
          />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Canto
          </span>
        </Link>
      </div>

      {/* Hero */}
      <MediaDetailHero
        id={media.id}
        type={media.type as "movie" | "show"}
        title={media.title}
        overview={media.overview}
        backdropPath={media.backdropPath}
        posterPath={media.posterPath}
        year={media.year}
        releaseDate={media.releaseDate}
        voteAverage={media.voteAverage}
        genres={media.genres ?? undefined}
        genreIds={media.genreIds ?? undefined}
        runtime={media.runtime}
        contentRating={media.contentRating}
        logoPath={media.logoPath}
        externalId={media.externalId}
        provider={media.provider}
        isAdmin={detail.isAdmin}
        servers={detail.mediaServers.data}
        flatrateProviders={detail.flatrateProviders}
        rentBuyProviders={detail.rentBuyProviders}
        watchLink={detail.watchLink}
        watchProviderLinks={detail.watchProviderLinks.data ?? {}}
        videos={detail.videos}
        crew={detail.extras.data?.credits.crew.map((c) => ({
          personId: c.id,
          name: c.name,
          job: c.job,
        }))}
        persistedId={detail.mediaId}
        trackingStatus={detail.userMediaState.data?.trackingStatus as "none" | "planned" | "watching" | "completed" | "dropped" | undefined}
        rating={detail.userMediaState.data?.rating}
        isFavorite={detail.userMediaState.data?.isFavorite}
        showManageAction={detail.isAdmin && media.inLibrary}
        onOpenManage={() => detail.setPreferencesOpen(true)}
        watchTrackingSeasons={
          media.seasons.map((season) => ({
            number: season.number,
                episodes:
                  season.episodes.map((episode) => ({
                    id: episode.id,
                    seasonNumber: season.number,
                    number: episode.number,
                    title: episode.title ?? null,
                    airDate: episode.airDate ?? null,
                  })),
              }))
        }
      >
        <div className="flex flex-col gap-12 pb-16 md:gap-16">
          {/* Admin: Download */}
          <AdminActions
            media={media}
            isAdmin={detail.isAdmin}
            mediaType={mediaType}
            liveTorrents={detail.liveTorrents.data ?? []}
            onOpenDownload={() => detail.setDownloadModalOpen(true)}
          />

          {/* Request Download — non-admin users */}
          <RequestSection
            media={media}
            mediaId={detail.mediaId}
            isAdmin={detail.isAdmin}
            existingRequest={detail.existingRequest}
            requestDownload={detail.requestDownload}
            cancelRequest={detail.cancelRequest}
          />

          {/* Videos */}
          <VideoCarouselSection
            videos={detail.videos}
            isLoading={detail.extras.isLoading}
          />

          {/* Reviews */}
          {detail.mediaId && (
            <MediaReviewSection
              mediaId={detail.mediaId}
              showExternalId={id}
              mediaType={mediaType}
            />
          )}

          {/* Seasons (TV Shows) — edge-to-edge scroll like Videos */}
          <SeasonsSection
            media={media}
            mediaId={detail.mediaId}
            availability={detail.availability}
            mediaServers={detail.mediaServers}
          />

          <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            {/* Cast */}
            <div className="animate-in fade-in-0 duration-500">
              <CastSection
                credits={detail.credits}
                isLoading={detail.extras.isLoading}
              />
            </div>
          </div>

          {/* Full-width sections -- Recommendations, Similar */}
          <div className="animate-in fade-in-0 duration-500">
            <SimilarSection
              similar={detail.similar}
              recommendations={detail.recommendations}
              isLoading={detail.extras.isLoading}
            />
          </div>
        </div>
      </MediaDetailHero>

      {/* Download modal */}
      <DownloadModal
        open={detail.downloadModalOpen}
        onOpenChange={detail.setDownloadModalOpen}
        mediaId={detail.mediaId}
        mediaType={media.type as "movie" | "show"}
        mediaTitle={media.title}
        isAdmin={detail.isAdmin}
        seasons={media.seasons.map((s) => ({
          id: s.id,
          number: s.number,
          name: s.name,
          episodeCount: s.episodeCount,
          airDate: s.airDate,
          episodes: s.episodes.map((e) => ({
            id: e.id,
            number: e.number,
            title: e.title,
            overview: e.overview,
            stillPath: e.stillPath,
            airDate: e.airDate,
            runtime: e.runtime,
          })),
        }))}
      />

      {/* Manage modal */}
      {detail.mediaId && (
        <ManageModal
          open={detail.preferencesOpen}
          onOpenChange={detail.setPreferencesOpen}
          mediaId={detail.mediaId}
          mediaType={media.type as "movie" | "show"}
          mediaTitle={media.title}
        />
      )}

      {/* Remove from library dialog */}
      <RemoveDialog
        media={media}
        open={detail.removeDialogOpen}
        onOpenChange={detail.setRemoveDialogOpen}
        setMediaLibrary={detail.setMediaLibrary}
        deleteTorrentMutation={detail.deleteTorrentMutation}
        utils={detail.utils}
      />
    </div>
  );
}
