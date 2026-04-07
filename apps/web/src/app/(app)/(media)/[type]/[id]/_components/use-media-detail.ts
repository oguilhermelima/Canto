"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useDirectSearch } from "~/hooks/use-direct-search";

const TORRENTS_PER_PAGE = 30;

export function useMediaDetail(id: string, mediaType: "movie" | "show") {
  const { data: session } = authClient.useSession();
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";

  const [torrentDialogOpen, setTorrentDialogOpen] = useState(false);
  const [seasonsHighlight, setSeasonsHighlight] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [torrentSearchQuery, setTorrentSearchQuery] = useState("");
  const [torrentPage, setTorrentPage] = useState(0);
  const [torrentQualityFilter, setTorrentQualityFilter] =
    useState<string>("all");
  const [torrentSourceFilter, setTorrentSourceFilter] =
    useState<string>("all");
  const [torrentSizeFilter, setTorrentSizeFilter] = useState<string>("all");
  const [torrentSort, setTorrentSort] = useState<
    "seeders" | "peers" | "size" | "age" | "confidence"
  >("confidence");
  const [torrentSortDir, setTorrentSortDir] = useState<"asc" | "desc">("desc");

  const [torrentSearchContext, setTorrentSearchContext] = useState<{
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<
    string | undefined
  >(undefined);
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [advancedQuery, setAdvancedQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const { region: watchRegion } = useWatchRegion();
  const { enabled: directSearchEnabled } = useDirectSearch();

  // Always use media.resolve — new routing always provides TMDB external ID + type
  const resolved = trpc.media.resolve.useQuery({
    provider: "tmdb",
    externalId: parseInt(id, 10),
    type: mediaType,
  });

  const resolvedData = resolved.data;
  const media = resolvedData?.media;
  const mediaLoading = resolved.isLoading;
  const mediaId = resolvedData?.persisted
    ? (resolvedData.media as { id?: string }).id
    : undefined;

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

  const isMovieInLibrary = media?.type === "movie" && !!media?.libraryId;
  const mediaTorrentsQuery = trpc.torrent.listByMedia.useQuery(
    { mediaId: mediaId ?? "" },
    { enabled: !!mediaId && isMovieInLibrary },
  );
  const mediaTorrents = mediaTorrentsQuery.data;

  const torrentSearch = trpc.torrent.search.useQuery(
    {
      mediaId: mediaId ?? "",
      query: advancedSearch && committedQuery ? committedQuery : undefined,
      seasonNumber: advancedSearch
        ? undefined
        : torrentSearchContext?.seasonNumber,
      episodeNumbers: advancedSearch
        ? undefined
        : torrentSearchContext?.episodeNumbers,
      page: torrentPage,
      pageSize: TORRENTS_PER_PAGE,
    },
    {
      enabled:
        torrentDialogOpen &&
        !!mediaId &&
        (!advancedSearch || committedQuery.length > 0),
      retry: 1,
      staleTime: 0,
    },
  );

  const [lastDownloadAttempt, setLastDownloadAttempt] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const replaceTorrent = trpc.torrent.replace.useMutation({
    onSuccess: () => {
      toast.success("Replacement download started");
      setTorrentDialogOpen(false);
      setLastDownloadAttempt(null);
    },
    onError: (error) => {
      toast.error(`Replace failed: ${error.message}`);
    },
  });

  const downloadTorrent = trpc.torrent.download.useMutation({
    onSuccess: () => {
      toast.success("Download started");
      setTorrentDialogOpen(false);
      setLastDownloadAttempt(null);
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        toast.error(error.message, {
          action: {
            label: "Replace",
            onClick: () => {
              if (!lastDownloadAttempt || !mediaId) return;
              const isMagnet =
                lastDownloadAttempt.url.startsWith("magnet:");
              replaceTorrent.mutate({
                replaceFileIds: [],
                mediaId: mediaId!,
                ...(isMagnet
                  ? { magnetUrl: lastDownloadAttempt.url }
                  : { torrentUrl: lastDownloadAttempt.url }),
                title: lastDownloadAttempt.title,
                seasonNumber: torrentSearchContext?.seasonNumber,
                episodeNumbers:
                  torrentSearchContext?.episodeNumbers ?? undefined,
              });
            },
          },
          duration: 10000,
        });
      } else {
        toast.error(`Download failed: ${error.message}`);
      }
    },
  });

  const deleteTorrentMutation = trpc.torrent.delete.useMutation();
  const persistMedia = trpc.media.persist.useMutation();
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
    select: (data) => data.find((r) => r.mediaId === mediaId),
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

  const handleDownload = (url: string, title: string): void => {
    if (!mediaId) return;
    setLastDownloadAttempt({ url, title });
    const isMagnet = url.startsWith("magnet:");
    downloadTorrent.mutate({
      mediaId: mediaId!,
      ...(isMagnet ? { magnetUrl: url } : { torrentUrl: url }),
      title,
      seasonNumber: torrentSearchContext?.seasonNumber,
      episodeNumbers: torrentSearchContext?.episodeNumbers ?? undefined,
      folderId: selectedFolderId,
    });
  };

  const openTorrentDialog = (context?: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  }): void => {
    setTorrentSearchContext(context ?? null);
    setTorrentSearchQuery("");
    setTorrentPage(0);
    setTorrentQualityFilter("all");
    setTorrentSourceFilter("all");
    setTorrentSizeFilter("all");
    setTorrentSort("confidence");
    setTorrentSortDir("desc");
    setTorrentDialogOpen(true);
  };

  // Derived state: credits, similar, recommendations, videos
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

  const videos = (extras.data?.videos ?? []).slice().sort((a, b) => {
    const priority = (videoType: string | undefined): number => {
      if (videoType === "Trailer") return 0;
      if (videoType === "Teaser") return 1;
      return 2;
    };
    return priority(a.type) - priority(b.type);
  });

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

  // Filter + sort torrent results
  const hasMore = torrentSearch.data?.hasMore ?? false;
  const allFilteredTorrents = (torrentSearch.data?.results ?? [])
    .filter((t) => {
      if (torrentSearchQuery.trim()) {
        if (
          !t.title.toLowerCase().includes(torrentSearchQuery.toLowerCase())
        )
          return false;
      }
      if (torrentQualityFilter !== "all" && t.quality !== torrentQualityFilter)
        return false;
      if (torrentSourceFilter !== "all" && t.source !== torrentSourceFilter)
        return false;
      if (torrentSizeFilter !== "all") {
        const gb = t.size / (1024 * 1024 * 1024);
        if (torrentSizeFilter === "small" && gb >= 2) return false;
        if (torrentSizeFilter === "medium" && (gb < 2 || gb >= 10))
          return false;
        if (torrentSizeFilter === "large" && gb < 10) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = torrentSortDir === "desc" ? -1 : 1;
      if (torrentSort === "confidence")
        return (a.confidence - b.confidence) * dir;
      if (torrentSort === "seeders") return (a.seeders - b.seeders) * dir;
      if (torrentSort === "peers") return (a.leechers - b.leechers) * dir;
      if (torrentSort === "age") return (a.age - b.age) * dir;
      return (a.size - b.size) * dir;
    });
  const paginatedTorrents =
    advancedSearch && !committedQuery ? [] : allFilteredTorrents;

  const toggleSort = (
    col: "seeders" | "peers" | "size" | "age" | "confidence",
  ): void => {
    if (torrentSort === col) {
      setTorrentSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setTorrentSort(col);
      setTorrentSortDir("desc");
    }
    setTorrentPage(0);
  };

  return {
    // Session
    isAdmin,
    session,

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
    torrentSearch,
    existingRequest,
    allLibraries,

    // Mutations
    downloadTorrent,
    replaceTorrent,
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

    // Torrent state
    torrentDialogOpen,
    setTorrentDialogOpen,
    torrentSearchContext,
    setTorrentSearchContext,
    torrentSearchQuery,
    setTorrentSearchQuery,
    torrentPage,
    setTorrentPage,
    torrentQualityFilter,
    setTorrentQualityFilter,
    torrentSourceFilter,
    setTorrentSourceFilter,
    torrentSizeFilter,
    setTorrentSizeFilter,
    torrentSort,
    torrentSortDir,
    toggleSort,
    advancedSearch,
    setAdvancedSearch,
    advancedQuery,
    setAdvancedQuery,
    committedQuery,
    setCommittedQuery,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    selectedFolderId,
    setSelectedFolderId,
    paginatedTorrents,
    allFilteredTorrents,
    hasMore,
    lastDownloadAttempt,
    setLastDownloadAttempt,

    // Handlers
    handleDownload,
    openTorrentDialog,

    // UI state
    seasonsHighlight,
    setSeasonsHighlight,
    removeDialogOpen,
    setRemoveDialogOpen,
    preferencesOpen,
    setPreferencesOpen,

    // Utils
    utils,
  };
}
