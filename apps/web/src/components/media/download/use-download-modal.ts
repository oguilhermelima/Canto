"use client";

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useTorrentSearchStream } from "./use-torrent-search-stream";

const TORRENTS_PER_PAGE = 30;

interface SeasonItem {
  id: string;
  number: number;
  name: string | null;
  episodes: Array<{
    id: string;
    number: number;
    title: string | null;
  }>;
}

export function useDownloadModal(
  mediaId: string | undefined,
  _mediaType: "movie" | "show",
  open: boolean,
) {
  const utils = trpc.useUtils();

  const invalidateTorrents = useCallback(() => {
    if (!mediaId) return;
    void utils.torrent.listLiveByMedia.invalidate({ mediaId });
    void utils.torrent.listByMedia.invalidate({ mediaId });
    void utils.torrent.listLive.invalidate();
    void utils.media.listFiles.invalidate({ mediaId });
  }, [utils, mediaId]);

  // ── Step ──
  const [step, setStep] = useState<1 | 2>(1);

  // ── Season/Episode Selection (step 1) ──
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(
    new Set(),
  );
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(
    new Set(),
  );

  // ── Torrent Search State (step 2) ──
  const [torrentSearchContext, setTorrentSearchContext] = useState<{
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null>(null);
  const [torrentSearchQuery, setTorrentSearchQuery] = useState("");
  const [torrentQualityFilter, setTorrentQualityFilter] = useState("all");
  const [torrentSourceFilter, setTorrentSourceFilter] = useState("all");
  const [torrentSizeFilter, setTorrentSizeFilter] = useState("all");
  const [torrentSort, setTorrentSort] = useState<
    "seeders" | "peers" | "size" | "age" | "confidence"
  >("confidence");
  const [torrentSortDir, setTorrentSortDir] = useState<"asc" | "desc">(
    "desc",
  );
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [advancedQuery, setAdvancedQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<
    string | undefined
  >(undefined);
  const [lastDownloadAttempt, setLastDownloadAttempt] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [replaceConflict, setReplaceConflict] = useState<{
    message: string;
    url: string;
    title: string;
  } | null>(null);

  // ── tRPC Queries ──
  // Per-indexer streaming search. Each enabled indexer becomes its own
  // query so a slow indexer doesn't block results from the fast ones.
  const torrentSearch = useTorrentSearchStream(
    {
      mediaId: mediaId ?? "",
      query: advancedSearch && committedQuery ? committedQuery : undefined,
      seasonNumber: advancedSearch
        ? undefined
        : torrentSearchContext?.seasonNumber,
      episodeNumbers: advancedSearch
        ? undefined
        : torrentSearchContext?.episodeNumbers,
      pageSize: TORRENTS_PER_PAGE,
    },
    {
      enabled:
        open &&
        step === 2 &&
        !!mediaId &&
        (!advancedSearch || committedQuery.length > 0),
    },
  );

  // ── Mutations ──
  const replaceTorrent = trpc.torrent.replace.useMutation({
    onSuccess: () => {
      toast.success("Replacement download started");
      invalidateTorrents();
    },
    onError: (error) => {
      toast.error(`Replace failed: ${error.message}`);
    },
  });

  const downloadTorrent = trpc.torrent.download.useMutation({
    onSuccess: () => {
      toast.success("Download started");
      invalidateTorrents();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT" && lastDownloadAttempt) {
        setReplaceConflict({
          message: error.message,
          url: lastDownloadAttempt.url,
          title: lastDownloadAttempt.title,
        });
      } else {
        toast.error(`Download failed: ${error.message}`);
      }
    },
  });

  // ── Handlers ──
  const confirmReplace = useCallback((): void => {
    if (!replaceConflict || !mediaId) return;
    const isMagnet = replaceConflict.url.startsWith("magnet:");
    replaceTorrent.mutate({
      replaceFileIds: [],
      mediaId,
      ...(isMagnet
        ? { magnetUrl: replaceConflict.url }
        : { torrentUrl: replaceConflict.url }),
      title: replaceConflict.title,
      seasonNumber: torrentSearchContext?.seasonNumber,
      episodeNumbers: torrentSearchContext?.episodeNumbers ?? undefined,
    });
    setReplaceConflict(null);
  }, [replaceConflict, mediaId, replaceTorrent, torrentSearchContext]);

  const dismissReplace = useCallback((): void => {
    setReplaceConflict(null);
  }, []);

  const handleDownload = useCallback(
    (url: string, title: string): void => {
      if (!mediaId) return;
      setLastDownloadAttempt({ url, title });
      const isMagnet = url.startsWith("magnet:");
      downloadTorrent.mutate({
        mediaId,
        ...(isMagnet ? { magnetUrl: url } : { torrentUrl: url }),
        title,
        seasonNumber: torrentSearchContext?.seasonNumber,
        episodeNumbers: torrentSearchContext?.episodeNumbers ?? undefined,
        folderId: selectedFolderId,
      });
    },
    [mediaId, downloadTorrent, torrentSearchContext, selectedFolderId],
  );

  const goToStep2 = useCallback(
    (seasons: SeasonItem[]) => {
      const seasonNums = [...selectedSeasons].sort((a, b) => a - b);
      const episodesBySeasonFromSelection: Map<number, number[]> = new Map();

      for (const epId of selectedEpisodes) {
        for (const s of seasons) {
          const ep = s.episodes.find((e) => e.id === epId);
          if (ep) {
            if (!episodesBySeasonFromSelection.has(s.number))
              episodesBySeasonFromSelection.set(s.number, []);
            episodesBySeasonFromSelection.get(s.number)!.push(ep.number);
          }
        }
      }

      if (seasonNums.length > 0 && episodesBySeasonFromSelection.size === 0) {
        setTorrentSearchContext({ seasonNumber: seasonNums[0] });
      } else if (episodesBySeasonFromSelection.size === 1) {
        const [sn, eps] = [...episodesBySeasonFromSelection.entries()][0]!;
        setTorrentSearchContext({
          seasonNumber: sn,
          episodeNumbers: eps.sort((a, b) => a - b),
        });
      } else if (seasonNums.length > 0) {
        setTorrentSearchContext({ seasonNumber: seasonNums[0] });
      } else if (episodesBySeasonFromSelection.size > 0) {
        const [sn, eps] = [...episodesBySeasonFromSelection.entries()][0]!;
        setTorrentSearchContext({
          seasonNumber: sn,
          episodeNumbers: eps.sort((a, b) => a - b),
        });
      }

      setStep(2);
    },
    [selectedSeasons, selectedEpisodes],
  );

  const setStep2Direct = useCallback(() => {
    setStep(2);
  }, []);

  const goBackToStep1 = useCallback(() => {
    setStep(1);
    setTorrentSearchContext(null);
    setTorrentSearchQuery("");
    setAdvancedSearch(false);
    setAdvancedQuery("");
    setCommittedQuery("");
  }, []);

  const reset = useCallback((): void => {
    setStep(1);
    setSelectedSeasons(new Set());
    setSelectedEpisodes(new Set());
    setTorrentSearchContext(null);
    setTorrentSearchQuery("");
    setTorrentQualityFilter("all");
    setTorrentSourceFilter("all");
    setTorrentSizeFilter("all");
    setTorrentSort("confidence");
    setTorrentSortDir("desc");
    setAdvancedSearch(false);
    setAdvancedQuery("");
    setCommittedQuery("");
    setMobileFiltersOpen(false);
    setSelectedFolderId(undefined);
    setLastDownloadAttempt(null);
    setReplaceConflict(null);
  }, []);

  const toggleSort = useCallback(
    (col: "seeders" | "peers" | "size" | "age" | "confidence"): void => {
      if (torrentSort === col) {
        setTorrentSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setTorrentSort(col);
        setTorrentSortDir("desc");
      }
    },
    [torrentSort],
  );

  // ── Derived ──
  const allFilteredTorrents = useMemo(
    () =>
      (torrentSearch.data?.results ?? [])
        .filter((t) => {
          if (torrentSearchQuery.trim()) {
            if (
              !t.title
                .toLowerCase()
                .includes(torrentSearchQuery.toLowerCase())
            )
              return false;
          }
          if (
            torrentQualityFilter !== "all" &&
            t.quality !== torrentQualityFilter
          )
            return false;
          if (
            torrentSourceFilter !== "all" &&
            t.source !== torrentSourceFilter
          )
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
          if (torrentSort === "seeders")
            return (a.seeders - b.seeders) * dir;
          if (torrentSort === "peers")
            return (a.leechers - b.leechers) * dir;
          if (torrentSort === "age") return (a.age - b.age) * dir;
          return (a.size - b.size) * dir;
        }),
    [
      torrentSearch.data,
      torrentSearchQuery,
      torrentQualityFilter,
      torrentSourceFilter,
      torrentSizeFilter,
      torrentSort,
      torrentSortDir,
    ],
  );
  const visibleTorrents =
    advancedSearch && !committedQuery ? [] : allFilteredTorrents;

  const hasSelection = selectedSeasons.size > 0 || selectedEpisodes.size > 0;

  return {
    // Step
    step,
    goToStep2,
    setStep2Direct,
    goBackToStep1,
    reset,

    // Selection
    selectedSeasons,
    setSelectedSeasons,
    selectedEpisodes,
    setSelectedEpisodes,
    hasSelection,

    // Torrent search
    torrentSearchContext,
    setTorrentSearchContext,
    torrentSearchQuery,
    setTorrentSearchQuery,
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
    torrentSearch,
    visibleTorrents,
    allFilteredTorrents,
    lastDownloadAttempt,
    setLastDownloadAttempt,
    handleDownload,
    downloadTorrent,
    replaceConflict,
    confirmReplace,
    dismissReplace,
    replaceTorrent,
  };
}
