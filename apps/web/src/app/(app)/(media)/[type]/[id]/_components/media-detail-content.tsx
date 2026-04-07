"use client";

import Link from "next/link";
import {
  MediaDetailHero,
  MediaDetailHeroSkeleton,
} from "~/components/media/media-detail-hero";
import { CastSection } from "~/components/media/cast-section";
import { SimilarSection } from "~/components/media/similar-section";
import { PreferencesModal } from "~/components/media/manage/preferences-modal";
import { useMediaDetail } from "./use-media-detail";
import { AdminActions } from "./admin-actions";
import { RequestSection } from "./request-section";
import { VideoCarouselSection } from "./video-carousel";
import { SeasonsSection } from "./seasons-section";
import { RemoveDialog } from "./remove-dialog";
import { TorrentDialog } from "./torrent-dialog";

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
          <h2 className="mb-2 text-xl font-semibold text-foreground">
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
          <img
            src="/room.png"
            alt="Canto"
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
        genres={media.genres ?? undefined}
        genreIds={media.genreIds ?? undefined}
        runtime={media.runtime}
        contentRating={media.contentRating}
        logoPath={media.logoPath}
        provider={media.provider}
        isAdmin={detail.isAdmin}
        servers={detail.mediaServers.data}
        flatrateProviders={detail.flatrateProviders}
        rentBuyProviders={detail.rentBuyProviders}
        watchLink={detail.watchLink}
        watchProviderLinks={detail.watchProviderLinks.data ?? {}}
        videos={detail.videos}
        crew={detail.extras.data?.credits?.crew?.map((c) => ({
          personId: c.id,
          name: c.name,
          job: c.job,
        }))}
      >
        <div className="flex flex-col gap-12 pb-16 md:gap-16">
          {/* Admin: Download & Manage */}
          <AdminActions
            media={media}
            isAdmin={detail.isAdmin}
            mediaType={mediaType}
            openTorrentDialog={detail.openTorrentDialog}
            setSeasonsHighlight={detail.setSeasonsHighlight}
          />

          {/* Request Download — non-admin users */}
          <RequestSection
            media={media}
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

          <div className="flex flex-col gap-12 px-4 md:gap-16 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            {/* Seasons (TV Shows) */}
            <SeasonsSection
              media={media}
              isAdmin={detail.isAdmin}
              availability={detail.availability}
              mediaServers={detail.mediaServers}
              allLibraries={detail.allLibraries}
              openTorrentDialog={detail.openTorrentDialog}
              setMediaLibrary={detail.setMediaLibrary}
              setContinuousDownload={detail.setContinuousDownload}
              setTorrentSearchQuery={detail.setTorrentSearchQuery}
              setTorrentSearchContext={detail.setTorrentSearchContext}
              setTorrentPage={detail.setTorrentPage}
              setTorrentDialogOpen={detail.setTorrentDialogOpen}
              torrentDialogOpen={detail.torrentDialogOpen}
              seasonsHighlight={detail.seasonsHighlight}
              mediaType={mediaType}
            />

            {/* Cast */}
            <CastSection
              credits={detail.credits}
              isLoading={detail.extras.isLoading}
            />
          </div>

          {/* Full-width sections -- Recommendations, Similar */}
          <SimilarSection
            similar={detail.similar}
            recommendations={detail.recommendations}
            isLoading={detail.extras.isLoading}
          />
        </div>
      </MediaDetailHero>

      {/* Preferences modal */}
      {media.libraryId && (
        <PreferencesModal
          open={detail.preferencesOpen}
          onOpenChange={detail.setPreferencesOpen}
          mediaId={media.id}
          mediaType={media.type as "movie" | "show"}
          mediaTitle={media.title}
          currentLibraryId={media.libraryId ?? null}
          continuousDownload={media.continuousDownload ?? false}
        />
      )}

      {/* Remove from library dialog */}
      <RemoveDialog
        media={media}
        removeDialogOpen={detail.removeDialogOpen}
        setRemoveDialogOpen={detail.setRemoveDialogOpen}
        removeDeleteFiles={detail.removeDeleteFiles}
        setRemoveDeleteFiles={detail.setRemoveDeleteFiles}
        removeDeleteTorrent={detail.removeDeleteTorrent}
        setRemoveDeleteTorrent={detail.setRemoveDeleteTorrent}
        setMediaLibrary={detail.setMediaLibrary}
        deleteTorrentMutation={detail.deleteTorrentMutation}
        utils={detail.utils}
      />

      {/* Torrent search dialog */}
      <TorrentDialog
        media={media}
        isAdmin={detail.isAdmin}
        torrentDialogOpen={detail.torrentDialogOpen}
        setTorrentDialogOpen={detail.setTorrentDialogOpen}
        torrentSearchContext={detail.torrentSearchContext}
        setTorrentSearchContext={detail.setTorrentSearchContext}
        torrentSearchQuery={detail.torrentSearchQuery}
        setTorrentSearchQuery={detail.setTorrentSearchQuery}
        torrentPage={detail.torrentPage}
        setTorrentPage={detail.setTorrentPage}
        torrentQualityFilter={detail.torrentQualityFilter}
        setTorrentQualityFilter={detail.setTorrentQualityFilter}
        torrentSourceFilter={detail.torrentSourceFilter}
        setTorrentSourceFilter={detail.setTorrentSourceFilter}
        torrentSizeFilter={detail.torrentSizeFilter}
        setTorrentSizeFilter={detail.setTorrentSizeFilter}
        torrentSort={detail.torrentSort}
        torrentSortDir={detail.torrentSortDir}
        toggleSort={detail.toggleSort}
        advancedSearch={detail.advancedSearch}
        setAdvancedSearch={detail.setAdvancedSearch}
        advancedQuery={detail.advancedQuery}
        setAdvancedQuery={detail.setAdvancedQuery}
        committedQuery={detail.committedQuery}
        setCommittedQuery={detail.setCommittedQuery}
        mobileFiltersOpen={detail.mobileFiltersOpen}
        setMobileFiltersOpen={detail.setMobileFiltersOpen}
        selectedFolderId={detail.selectedFolderId}
        setSelectedFolderId={detail.setSelectedFolderId}
        torrentSearch={detail.torrentSearch}
        paginatedTorrents={detail.paginatedTorrents}
        allFilteredTorrents={detail.allFilteredTorrents}
        hasMore={detail.hasMore}
        handleDownload={detail.handleDownload}
        downloadTorrent={detail.downloadTorrent}
        setLastDownloadAttempt={detail.setLastDownloadAttempt}
      />
    </div>
  );
}
