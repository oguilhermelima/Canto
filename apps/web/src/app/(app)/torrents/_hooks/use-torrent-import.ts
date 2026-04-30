"use client";

import { useCallback, useState } from "react";
import { useDebounceValue } from "usehooks-ts";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import {
  inferImportModeFromName
  
} from "../_lib/infer-import-mode";
import type {ImportMatchMode} from "../_lib/infer-import-mode";
import { sanitizeTorrentTitleForSearch } from "../_lib/sanitize-torrent-title";
import { resolveImportInput } from "../_lib/resolve-import-input";
import type {
  ClientTorrentItem,
  ImportStep,
  MediaSearchItem,
} from "../_lib/import-types";
import { useTorrentFileUpload } from "./use-torrent-file-upload";

export function useTorrentImport() {
  const [magnetDialogOpen, setMagnetDialogOpen] = useState(false);
  const [magnetLink, setMagnetLink] = useState("");
  const [clientImportDialogOpen, setClientImportDialogOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("select-torrent");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientTorrent, setSelectedClientTorrent] =
    useState<ClientTorrentItem | null>(null);
  const [importMatchMode, setImportMatchMode] = useState<ImportMatchMode>("movie");
  const [tmdbSearch, setTmdbSearch] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<MediaSearchItem | null>(null);
  const [seasonInput, setSeasonInput] = useState("");
  const [episodeInput, setEpisodeInput] = useState("");
  const [debouncedTmdbSearch] = useDebounceValue(tmdbSearch, 350);

  const utils = trpc.useUtils();
  const invalidate = useCallback(() => {
    void utils.torrent.listLive.invalidate();
    void utils.torrent.listClient.invalidate();
  }, [utils]);

  const fileUpload = useTorrentFileUpload({ onUploaded: invalidate });

  const clientListQuery = trpc.torrent.listClient.useQuery(undefined, {
    enabled: clientImportDialogOpen,
    refetchInterval: clientImportDialogOpen ? 5000 : false,
  });
  const tmdbSearchQuery = trpc.media.browse.useQuery(
    {
      mode: "search",
      query: debouncedTmdbSearch,
      type: importMatchMode === "movie" ? "movie" : "show",
      provider: "tmdb",
    },
    {
      enabled:
        clientImportDialogOpen &&
        importStep === "select-media" &&
        debouncedTmdbSearch.trim().length >= 2,
    },
  );

  const addMagnet = trpc.torrent.addMagnet.useMutation({
    onSuccess: () => {
      invalidate();
      setMagnetDialogOpen(false);
      setMagnetLink("");
      toast.success("Magnetic link imported");
    },
    onError: (err) => toast.error(err.message),
  });
  const importFromClient = trpc.torrent.importFromClient.useMutation({
    onSuccess: (result) => {
      invalidate();
      toast.success(`Imported and linked to ${result.mediaTitle}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetClientImportDialog = useCallback(() => {
    setImportStep("select-torrent");
    setClientSearch("");
    setSelectedClientTorrent(null);
    setImportMatchMode("movie");
    setTmdbSearch("");
    setSelectedMedia(null);
    setSeasonInput("");
    setEpisodeInput("");
  }, []);

  const submitMagnet = useCallback(() => {
    const trimmed = magnetLink.trim();
    if (!trimmed.startsWith("magnet:")) {
      toast.error("Use a valid magnetic link");
      return;
    }
    addMagnet.mutate({ magnetUrl: trimmed });
  }, [magnetLink, addMagnet]);

  const goToMediaStep = useCallback((item: ClientTorrentItem) => {
    setSelectedClientTorrent(item);
    setImportMatchMode(inferImportModeFromName(item.name));
    setTmdbSearch(sanitizeTorrentTitleForSearch(item.name));
    setSelectedMedia(null);
    setSeasonInput("");
    setEpisodeInput("");
    setImportStep("select-media");
  }, []);

  const submitClientImport = useCallback(async () => {
    if (!selectedClientTorrent) { toast.error("Choose a torrent first"); return; }
    if (!selectedMedia) { toast.error("Choose the exact media on TMDB"); return; }

    const resolved = resolveImportInput(importMatchMode, seasonInput, episodeInput);
    if (!resolved.ok) { toast.error(resolved.error); return; }

    await importFromClient.mutateAsync({
      hash: selectedClientTorrent.hash,
      mediaExternalId: selectedMedia.externalId,
      mediaProvider: selectedMedia.provider,
      mediaType: selectedMedia.type,
      ...resolved.value,
    });
    setClientImportDialogOpen(false);
    resetClientImportDialog();
  }, [
    selectedClientTorrent,
    selectedMedia,
    importMatchMode,
    seasonInput,
    episodeInput,
    importFromClient,
    resetClientImportDialog,
  ]);

  return {
    ...fileUpload,

    magnetDialogOpen,
    setMagnetDialogOpen,
    magnetLink,
    setMagnetLink,
    submitMagnet,
    magnetPending: addMagnet.isPending,

    clientImportDialogOpen,
    setClientImportDialogOpen,
    resetClientImportDialog,
    importStep,
    setImportStep,
    clientSearch,
    setClientSearch,
    selectedClientTorrent,
    goToMediaStep,
    importMatchMode,
    setImportMatchMode,
    tmdbSearch,
    setTmdbSearch,
    debouncedTmdbSearch,
    selectedMedia,
    setSelectedMedia,
    seasonInput,
    setSeasonInput,
    episodeInput,
    setEpisodeInput,
    submitClientImport,
    clientImportPending: importFromClient.isPending,

    clientList: (clientListQuery.data ?? []) as ClientTorrentItem[],
    clientListLoading: clientListQuery.isLoading,
    searchResults: (tmdbSearchQuery.data?.results ?? []) as MediaSearchItem[],
    searchLoading: tmdbSearchQuery.isLoading,
  };
}
