"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { useIsAdmin } from "~/hooks/use-is-admin";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useDirectSearch } from "~/hooks/use-direct-search";

export function useMediaDetail(id: string, mediaType: "movie" | "show") {
  const isAdmin = useIsAdmin();

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  const { region: watchRegion } = useWatchRegion();
  const { enabled: directSearchEnabled } = useDirectSearch();
  const { data: userLanguage } = trpc.settings.getUserLanguage.useQuery(
    undefined,
    { staleTime: Infinity },
  );

  // Always use media.resolve — new routing always provides TMDB external ID + type
  const resolved = trpc.media.resolve.useQuery({
    provider: "tmdb",
    externalId: parseInt(id, 10),
    type: mediaType,
  });

  const resolvedData = resolved.data;
  const media = resolvedData?.media;
  const mediaLoading = resolved.isLoading;
  const mediaId = (resolvedData as { mediaId?: string } | undefined)?.mediaId;

  const extras = {
    data: resolvedData?.extras,
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

  const utils = trpc.useUtils();

  const userMediaState = trpc.userMedia.getState.useQuery(
    { mediaId: mediaId ?? "" },
    { enabled: !!mediaId },
  );

  const deleteTorrentMutation = trpc.torrent.delete.useMutation();
  const persistMedia = trpc.media.persist.useMutation({
    onSuccess: () => {
      void utils.media.resolve.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to save media: ${err.message}`);
    },
  });

  // Persist on visit: when resolve returns live data (not from DB), persist it
  const resolvedSource = (resolvedData as { source?: string } | undefined)?.source;
  const didPersist = useRef(false);
  useEffect(() => {
    if (resolvedData && resolvedSource === "live" && !didPersist.current && !persistMedia.isPending) {
      didPersist.current = true;
      persistMedia.mutate({
        provider: "tmdb",
        externalId: parseInt(id, 10),
        type: mediaType,
      });
    }
  }, [resolvedData, resolvedSource, id, mediaType, persistMedia]);

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

  const videos = (() => {
    const all = extras.data?.videos ?? [];
    // userLanguage is like "pt-BR", extract prefix "pt"
    const langPrefix = userLanguage?.split("-")[0] ?? "en";
    const allowed = new Set([langPrefix, "en", "ja"]);
    const filtered = all.filter(
      (v) => !v.language || allowed.has(v.language),
    );
    const source = filtered.length > 0 ? filtered : all;
    return source.slice().sort((a, b) => {
      const priority = (videoType: string | undefined): number => {
        if (videoType === "Trailer") return 0;
        if (videoType === "Teaser") return 1;
        return 2;
      };
      return priority(a.type) - priority(b.type);
    });
  })();

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
    existingRequest,
    allLibraries,
    userMediaState,

    // Mutations
    deleteTorrentMutation,
    persistMedia,
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
