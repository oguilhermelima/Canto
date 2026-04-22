"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWatchRegion } from "@/hooks/use-watch-region";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useDirectSearch } from "@/hooks/use-direct-search";
import { resolveState } from "@/lib/torrent-utils";

export function useMediaDetail(id: string, mediaType: "movie" | "show") {
  const isAdmin = useIsAdmin();

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  const { region: watchRegion } = useWatchRegion();
  const { enabled: directSearchEnabled } = useDirectSearch();

  const resolved = trpc.media.resolve.useQuery({
    provider: "tmdb",
    externalId: parseInt(id, 10),
    type: mediaType,
  });

  const resolvedData = resolved.data;
  const media = resolvedData?.media;
  const mediaLoading = resolved.isLoading;
  const mediaId = resolvedData?.mediaId;
  const extrasData = resolvedData?.extras;

  const extras = {
    data: extrasData,
    isLoading: resolved.isLoading,
  };

  useDocumentTitle(media?.title);

  const availability = trpc.sync.mediaAvailability.useQuery(
    { mediaId: mediaId ?? "" },
    { enabled: !!mediaId, staleTime: Infinity },
  );

  const mediaServers = trpc.sync.mediaServers.useQuery(
    { mediaId: mediaId ?? "" },
    { enabled: !!mediaId, staleTime: Infinity },
  );

  const watchProviderLinks = trpc.provider.watchProviderLinks.useQuery(
    undefined,
    { staleTime: Infinity, enabled: directSearchEnabled },
  );

  const isMovieInLibrary = media?.type === "movie" && !!media.libraryId;
  const mediaTorrentsQuery = trpc.torrent.listByMedia.useQuery(
    { mediaId: mediaId ?? "" },
    { enabled: !!mediaId && isMovieInLibrary },
  );
  const mediaTorrents = mediaTorrentsQuery.data;
  const liveTorrents = trpc.torrent.listLiveByMedia.useQuery(
    { mediaId: mediaId ?? "" },
    {
      enabled: !!mediaId && isAdmin,
      refetchInterval: (query) => {
        const items = query.state.data;
        if (!items || items.length === 0) return 15_000;
        return items.some(
          (t) =>
            !resolveState(
              t.status,
              t.live?.state,
              t.live?.progress ?? t.progress,
            ).isDownloaded,
        )
          ? 3_000
          : 15_000;
      },
    },
  );

  const utils = trpc.useUtils();

  const userMediaState = trpc.userMedia.getState.useQuery(
    { mediaId: mediaId ?? "" },
    { enabled: !!mediaId },
  );

  const deleteTorrentMutation = trpc.torrent.delete.useMutation();

  const requestDownload = trpc.request.create.useMutation({
    onSuccess: () => {
      toast.success("Download requested");
      void utils.request.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const cancelRequest = trpc.request.cancel.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled");
      void utils.request.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const existingRequest = trpc.request.list.useQuery(undefined, {
    select: (data) => data.items.find((r) => r.mediaId === mediaId),
    enabled: !isAdmin && !!mediaId,
  });

  const { data: allLibraries } = trpc.folder.list.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });
  const setContinuousDownload =
    trpc.library.setContinuousDownload.useMutation({
      onSuccess: () => {
        void utils.media.resolve.invalidate();
      },
    });
  const setMediaLibrary = trpc.library.setMediaLibrary.useMutation({
    onSuccess: () => {
      void utils.media.resolve.invalidate();
      toast.success("Library updated");
    },
    onError: (error) => {
      toast.error(`Failed to update library: ${error.message}`);
    },
  });

  // Derived state: credits, similar, recommendations, videos
  const credits = (extras.data?.credits.cast ?? []).map((c) => ({
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
  const regionData = watchProvidersByRegion[watchRegion];
  const tmdbType = media?.type === "show" ? "tv" : "movie";
  const watchLink =
    regionData?.link ??
    (media?.externalId
      ? `https://www.themoviedb.org/${tmdbType}/${media.externalId}/watch?locale=${watchRegion}`
      : undefined);
  const providerLinks = watchProviderLinks.data ?? {};
  type WatchProviderEntry = { providerId: number; providerName: string; logoPath: string };
  const dedup = (
    providers: WatchProviderEntry[],
  ): WatchProviderEntry[] => {
    const seen = new Set<string>();
    return providers.filter((p) => {
      const key =
        providerLinks[p.providerId] ?? `__id:${p.providerId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const flatrateProviders = dedup(regionData?.flatrate ?? []);
  const rentBuyProviders = dedup([
    ...(regionData?.rent ?? []),
    ...(regionData?.buy ?? []),
  ]).filter(
    (p) =>
      !flatrateProviders.some(
        (f) =>
          f.providerId === p.providerId || f.logoPath === p.logoPath,
      ),
  );

  return {
    // Session
    isAdmin,

    // Media data
    media,
    mediaId,
    mediaLoading,
    extras,

    // Queries
    availability,
    mediaServers,
    watchProviderLinks,
    mediaTorrents,
    liveTorrents,
    existingRequest,
    allLibraries,
    userMediaState,

    // Mutations
    deleteTorrentMutation,
    requestDownload,
    cancelRequest,
    setContinuousDownload,
    setMediaLibrary,

    // Derived state
    credits,
    similar,
    recommendations,
    videos,
    flatrateProviders,
    rentBuyProviders,
    watchLink,

    // UI state
    removeDialogOpen,
    setRemoveDialogOpen,
    preferencesOpen,
    setPreferencesOpen,
    downloadModalOpen,
    setDownloadModalOpen,

    // Utils
    utils,
  };
}
