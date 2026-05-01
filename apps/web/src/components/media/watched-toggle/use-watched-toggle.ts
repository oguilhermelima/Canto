import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type {
  BulkSelectionMode,
  HistoryGroup,
  ModalTab,
  MultiSelectOption,
  TrackingStatus,
  UserMediaStatePayload,
  WatchedAtMode,
  WatchEpisode,
  WatchHistoryEntry,
  WatchScope,
  WatchSeason,
} from "./types";
import {
  episodeLabel,
  isReleasedEpisode,
  normalizeStatus,
  toDatetimeLocalString,
} from "./utils";

interface UseWatchedToggleArgs {
  mediaId: string;
  mediaType: "movie" | "show";
  seasons: WatchSeason[];
  trackingStatus: TrackingStatus;
}

export interface UseWatchedToggleResult {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  activeTab: ModalTab;
  setActiveTab: Dispatch<SetStateAction<ModalTab>>;
  scope: WatchScope;
  setScope: Dispatch<SetStateAction<WatchScope>>;
  seasonNumber: number | undefined;
  setSeasonNumber: Dispatch<SetStateAction<number | undefined>>;
  dateMode: WatchedAtMode;
  setDateMode: Dispatch<SetStateAction<WatchedAtMode>>;
  customWatchedAt: string;
  setCustomWatchedAt: Dispatch<SetStateAction<string>>;
  bulkMode: BulkSelectionMode;
  setBulkMode: Dispatch<SetStateAction<BulkSelectionMode>>;
  selectedEpisodeIds: string[];
  setSelectedEpisodeIds: Dispatch<SetStateAction<string[]>>;
  selectedHistoryEntryIds: string[];
  releasedSeasons: WatchSeason[];
  currentSeasonEpisodes: WatchEpisode[];
  allReleasedEpisodes: WatchEpisode[];
  scopedEpisodes: WatchEpisode[];
  episodeOptions: MultiSelectOption[];
  historyQuery: ReturnType<typeof trpc.userMedia.getHistory.useQuery>;
  historyGroups: HistoryGroup[];
  normalizedStatus: TrackingStatus;
  pending: boolean;
  isDateValid: boolean;
  canContinueWhat: boolean;
  requiresBulkChoice: boolean;
  toggleEpisode: (episodeId: string) => void;
  toggleHistoryEntry: (entryId: string) => void;
  removeSelectedHistory: () => void;
  submitTracking: (useSelectedEpisodes: boolean) => void;
  markDropped: () => void;
  clearTracking: () => void;
}

export function useWatchedToggle({
  mediaId,
  mediaType,
  seasons,
  trackingStatus,
}: UseWatchedToggleArgs): UseWatchedToggleResult {
  const utils = trpc.useUtils();
  const isMovie = mediaType === "movie";
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("track");
  const [scope, setScope] = useState<WatchScope>(
    mediaType === "movie" ? "movie" : "episode",
  );
  const [seasonNumber, setSeasonNumber] = useState<number | undefined>(
    undefined,
  );
  const [dateMode, setDateMode] = useState<WatchedAtMode>("just_now");
  const [customWatchedAt, setCustomWatchedAt] = useState(
    toDatetimeLocalString(new Date()),
  );
  const [bulkMode, setBulkMode] = useState<BulkSelectionMode>("all");
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [selectedHistoryEntryIds, setSelectedHistoryEntryIds] = useState<
    string[]
  >([]);

  const orderedSeasons = useMemo(
    () =>
      [...seasons]
        .map((season) => ({
          ...season,
          episodes: [...season.episodes].sort((a, b) => a.number - b.number),
        }))
        .sort((a, b) => a.number - b.number),
    [seasons],
  );

  const releasedSeasons = useMemo(
    () =>
      orderedSeasons
        .map((season) => ({
          ...season,
          episodes: season.episodes.filter((episode) =>
            isReleasedEpisode(episode.airDate),
          ),
        }))
        .filter((season) => season.episodes.length > 0),
    [orderedSeasons],
  );

  const allEpisodes = useMemo(
    () => orderedSeasons.flatMap((season) => season.episodes),
    [orderedSeasons],
  );
  const allReleasedEpisodes = useMemo(
    () => releasedSeasons.flatMap((season) => season.episodes),
    [releasedSeasons],
  );

  const episodeById = useMemo(
    () =>
      new Map(allEpisodes.map((episode) => [episode.id, episode] as const)),
    [allEpisodes],
  );

  const currentSeasonEpisodes = useMemo(
    () =>
      releasedSeasons.find((season) => season.number === seasonNumber)
        ?.episodes ?? [],
    [releasedSeasons, seasonNumber],
  );

  const scopedEpisodes = useMemo(() => {
    if (mediaType !== "show") return [];
    if (scope === "show") return allReleasedEpisodes;
    if (scope === "season") return currentSeasonEpisodes;
    if (selectedEpisodeIds.length === 0) return [];
    const selectedSet = new Set(selectedEpisodeIds);
    return currentSeasonEpisodes.filter((episode) =>
      selectedSet.has(episode.id),
    );
  }, [
    mediaType,
    scope,
    allReleasedEpisodes,
    currentSeasonEpisodes,
    selectedEpisodeIds,
  ]);

  const historyQuery = trpc.userMedia.getHistory.useQuery(
    { mediaId },
    { enabled: open && activeTab === "history" },
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab("track");
    setDateMode("just_now");
    setCustomWatchedAt(toDatetimeLocalString(new Date()));
    setBulkMode("all");
    setSelectedHistoryEntryIds([]);

    if (mediaType === "movie") {
      setScope("movie");
      setSeasonNumber(undefined);
      setSelectedEpisodeIds([]);
      return;
    }

    const latestSeason = releasedSeasons[releasedSeasons.length - 1];
    const latestEpisode =
      latestSeason?.episodes[latestSeason.episodes.length - 1];
    setScope("episode");
    setSeasonNumber(latestSeason?.number);
    setSelectedEpisodeIds(latestEpisode ? [latestEpisode.id] : []);
  }, [open, mediaType, releasedSeasons, isMovie]);

  useEffect(() => {
    if (!open || mediaType !== "show" || scope !== "episode") return;

    const selectedSeason =
      seasonNumber !== undefined
        ? releasedSeasons.find((season) => season.number === seasonNumber)
        : undefined;
    const fallbackSeason =
      selectedSeason ?? releasedSeasons[releasedSeasons.length - 1];
    if (!fallbackSeason) {
      setSeasonNumber(undefined);
      setSelectedEpisodeIds([]);
      return;
    }

    if (seasonNumber !== fallbackSeason.number) {
      setSeasonNumber(fallbackSeason.number);
    }

    const seasonEpisodeIds = new Set(
      fallbackSeason.episodes.map((episode) => episode.id),
    );
    const validSelected = selectedEpisodeIds.filter((id) =>
      seasonEpisodeIds.has(id),
    );

    if (validSelected.length !== selectedEpisodeIds.length) {
      setSelectedEpisodeIds(validSelected);
    }
  }, [
    open,
    mediaType,
    scope,
    seasonNumber,
    releasedSeasons,
    selectedEpisodeIds,
  ]);

  useEffect(() => {
    if (!open || mediaType !== "show") return;
    if (scope === "show" || scope === "season") {
      setSelectedEpisodeIds(scopedEpisodes.map((episode) => episode.id));
      setBulkMode("all");
    }
  }, [open, mediaType, scope, scopedEpisodes]);

  // Clear history selection when leaving the history tab — useState snapshot
  // pattern (React docs: "You Might Not Need an Effect").
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  if (activeTab !== prevActiveTab) {
    setPrevActiveTab(activeTab);
    if (activeTab !== "history") {
      setSelectedHistoryEntryIds([]);
    }
  }

  const applyState = (state: UserMediaStatePayload): void => {
    utils.userMedia.getState.setData({ mediaId }, state);
    void utils.userMedia.getState.invalidate({ mediaId });
  };

  const trackMutation = trpc.userMedia.logWatched.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setOpen(false);
      setBulkMode("all");
      void utils.userMedia.getHistory.invalidate({ mediaId });
      toast.success(
        result.trackedItems > 0
          ? `Tracking updated (${result.trackedItems} item${result.trackedItems === 1 ? "" : "s"})`
          : "Tracking updated",
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const removeHistoryMutation = trpc.userMedia.removeHistoryEntries.useMutation(
    {
      onSuccess: (result) => {
        applyState(result.state as UserMediaStatePayload);
        setSelectedHistoryEntryIds([]);
        void utils.userMedia.getHistory.invalidate({ mediaId });
        toast.success(
          result.removedItems > 0
            ? `Removed ${result.removedItems} history item${result.removedItems === 1 ? "" : "s"}`
            : "No history items removed",
        );
      },
      onError: (error) => toast.error(error.message),
    },
  );

  const markDroppedMutation = trpc.userMedia.markDropped.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setOpen(false);
      toast.success("Marked as dropped");
    },
    onError: (error) => toast.error(error.message),
  });

  const clearTrackingMutation = trpc.userMedia.clearTracking.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setOpen(false);
      toast.success("Tracking status cleared");
    },
    onError: (error) => toast.error(error.message),
  });

  const pending =
    trackMutation.isPending ||
    removeHistoryMutation.isPending ||
    markDroppedMutation.isPending ||
    clearTrackingMutation.isPending;

  const isDateValid =
    dateMode !== "other_date" ||
    !Number.isNaN(new Date(customWatchedAt).getTime());

  const canContinueWhat =
    mediaType === "movie" ||
    (scope === "show" && allReleasedEpisodes.length > 0) ||
    (scope === "season" &&
      seasonNumber !== undefined &&
      currentSeasonEpisodes.length > 0) ||
    (scope === "episode" &&
      seasonNumber !== undefined &&
      selectedEpisodeIds.length > 0 &&
      scopedEpisodes.length > 0);

  const requiresBulkChoice =
    mediaType === "show" &&
    (scope === "show" || scope === "season") &&
    scopedEpisodes.length > 1;

  const episodeOptions = useMemo(
    () =>
      currentSeasonEpisodes.map((episode) => ({
        value: episode.id,
        label: episodeLabel(episode),
      })),
    [currentSeasonEpisodes],
  );

  const submitTracking = (useSelectedEpisodes: boolean): void => {
    const payload: {
      mediaId: string;
      watchedAtMode: WatchedAtMode;
      watchedAt?: string;
      scope?: WatchScope;
      seasonNumber?: number;
      selectedEpisodeIds?: string[];
    } = {
      mediaId,
      watchedAtMode: dateMode,
    };

    if (dateMode === "other_date") {
      const parsed = new Date(customWatchedAt);
      if (Number.isNaN(parsed.getTime())) {
        toast.error("Invalid watch date");
        return;
      }
      payload.watchedAt = parsed.toISOString();
    }

    if (mediaType === "movie") {
      payload.scope = "movie";
    } else if (scope === "episode") {
      if (selectedEpisodeIds.length === 0) {
        toast.error("Select at least one episode");
        return;
      }
      payload.selectedEpisodeIds = selectedEpisodeIds;
    } else if (useSelectedEpisodes) {
      if (selectedEpisodeIds.length === 0) {
        toast.error("Select at least one episode");
        return;
      }
      payload.selectedEpisodeIds = selectedEpisodeIds;
    } else if (scope === "show") {
      payload.scope = "show";
    } else if (scope === "season") {
      payload.scope = "season";
      payload.seasonNumber = seasonNumber;
    } else {
      payload.scope = "show";
    }

    trackMutation.mutate(payload);
  };

  const toggleEpisode = (episodeId: string): void => {
    setSelectedEpisodeIds((current) =>
      current.includes(episodeId)
        ? current.filter((id) => id !== episodeId)
        : [...current, episodeId],
    );
  };

  const toggleHistoryEntry = (entryId: string): void => {
    setSelectedHistoryEntryIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId],
    );
  };

  const removeSelectedHistory = (): void => {
    if (selectedHistoryEntryIds.length === 0) return;
    removeHistoryMutation.mutate({
      mediaId,
      entryIds: selectedHistoryEntryIds,
    });
  };

  const markDropped = (): void => {
    markDroppedMutation.mutate({ mediaId });
  };

  const clearTracking = (): void => {
    clearTrackingMutation.mutate({ mediaId });
  };

  const normalizedStatus = normalizeStatus(trackingStatus);
  const historyEntries = useMemo(
    () => (historyQuery.data ?? []) as WatchHistoryEntry[],
    [historyQuery.data],
  );
  const historyGroups = useMemo<HistoryGroup[]>(() => {
    if (historyEntries.length === 0) return [];

    const groups = new Map<string, HistoryGroup>();

    for (const entry of historyEntries) {
      if (mediaType === "movie") {
        const key = "movie";
        const existing = groups.get(key) ?? { key, title: "Movie", items: [] };
        existing.items.push({ entry, label: "Movie" });
        groups.set(key, existing);
        continue;
      }

      if (!entry.episodeId) {
        const key = "other";
        const existing = groups.get(key) ?? { key, title: "Other", items: [] };
        existing.items.push({ entry, label: "Episode" });
        groups.set(key, existing);
        continue;
      }

      const episode = episodeById.get(entry.episodeId);
      if (!episode) {
        const key = "other";
        const existing = groups.get(key) ?? { key, title: "Other", items: [] };
        existing.items.push({ entry, label: "Episode" });
        groups.set(key, existing);
        continue;
      }

      const key = `season-${episode.seasonNumber}`;
      const existing = groups.get(key) ?? {
        key,
        title: `Season ${episode.seasonNumber}`,
        items: [],
      };
      existing.items.push({ entry, label: episodeLabel(episode) });
      groups.set(key, existing);
    }

    return [...groups.values()];
  }, [historyEntries, mediaType, episodeById]);

  return {
    open,
    setOpen,
    activeTab,
    setActiveTab,
    scope,
    setScope,
    seasonNumber,
    setSeasonNumber,
    dateMode,
    setDateMode,
    customWatchedAt,
    setCustomWatchedAt,
    bulkMode,
    setBulkMode,
    selectedEpisodeIds,
    setSelectedEpisodeIds,
    selectedHistoryEntryIds,
    releasedSeasons,
    currentSeasonEpisodes,
    allReleasedEpisodes,
    scopedEpisodes,
    episodeOptions,
    historyQuery,
    historyGroups,
    normalizedStatus,
    pending,
    isDateValid,
    canContinueWhat,
    requiresBulkChoice,
    toggleEpisode,
    toggleHistoryEntry,
    removeSelectedHistory,
    submitTracking,
    markDropped,
    clearTracking,
  };
}
