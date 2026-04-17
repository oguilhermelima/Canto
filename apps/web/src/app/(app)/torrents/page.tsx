"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useDebounceValue } from "usehooks-ts";
import {
  Loader2,
  Download,
  Upload,
  Link2,
  Search,
  ArrowLeft,
  Film,
  Tv,
  Check,
} from "lucide-react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Textarea } from "@canto/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { DropdownMenuItem } from "@canto/ui/dropdown-menu";
import { Skeleton } from "@canto/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "~/components/page-header";
import { TabBar } from "@canto/ui/tab-bar";
import { StateMessage } from "@canto/ui/state-message";
import { ResponsiveMenu } from "~/components/layout/responsive-menu";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { resolveState, formatBytes, formatEta, formatSpeed } from "~/lib/torrent-utils";
import { TorrentCard } from "./_components/torrent-card";
import { DeleteDialog } from "./_components/delete-dialog";
import type { DeleteTarget } from "./_components/delete-dialog";
import { buildFallbackMagnet } from "./_lib/build-fallback-magnet";
import { sanitizeTorrentTitleForSearch } from "./_lib/sanitize-torrent-title";
import { parseEpisodeNumbers } from "./_lib/parse-episode-numbers";
import { inferImportModeFromName, type ImportMatchMode } from "./_lib/infer-import-mode";

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "downloading", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
] as const;

type ImportStep = "select-torrent" | "select-media";

interface ClientTorrentItem {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  addedOn: number;
  completionOn: number;
  tracked: boolean;
  trackedTorrentId: string | null;
  trackedMediaId: string | null;
  trackedStatus: string | null;
}

interface MediaSearchItem {
  externalId: number;
  provider: "tmdb" | "tvdb";
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage: number | null;
}

function getClientStateLabel(state: string, progress: number): string {
  if (progress >= 1) return "Completed";
  if (state.includes("paused")) return "Paused";
  if (state.includes("stalled")) return "Stalled";
  if (state === "checkingDL" || state === "checkingUP" || state === "checkingResumeData") return "Checking";
  if (state === "error" || state === "missingFiles") return "Error";
  return "Downloading";
}

export default function DownloadsPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [magnetDialogOpen, setMagnetDialogOpen] = useState(false);
  const [magnetLink, setMagnetLink] = useState("");
  const [clientImportDialogOpen, setClientImportDialogOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("select-torrent");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientTorrent, setSelectedClientTorrent] = useState<ClientTorrentItem | null>(null);
  const [importMatchMode, setImportMatchMode] = useState<ImportMatchMode>("movie");
  const [tmdbSearch, setTmdbSearch] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<MediaSearchItem | null>(null);
  const [seasonInput, setSeasonInput] = useState("");
  const [episodeInput, setEpisodeInput] = useState("");
  const [debouncedTmdbSearch] = useDebounceValue(tmdbSearch, 350);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const modalInputCn =
    "h-10 rounded-xl border-none bg-accent text-sm ring-0 focus-visible:ring-1 focus-visible:ring-primary/30";

  useDocumentTitle("Downloads");

  const utils = trpc.useUtils();
  const invalidateTorrentLists = useCallback(() => {
    void utils.torrent.listLive.invalidate();
    void utils.torrent.listClient.invalidate();
  }, [utils]);

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.torrent.listLive.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      refetchInterval: 3000,
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const currentOffset = lastPageParam as number;
        if (currentOffset + lastPage.items.length >= lastPage.total) return undefined;
        return currentOffset + lastPage.items.length;
      },
      initialCursor: 0,
    },
  );
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

  const torrents = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const pauseMutation = trpc.torrent.pause.useMutation({
    onSuccess: invalidateTorrentLists,
    onError: (err) => toast.error(err.message),
  });
  const resumeMutation = trpc.torrent.resume.useMutation({
    onSuccess: invalidateTorrentLists,
    onError: (err) => toast.error(err.message),
  });
  const retryMutation = trpc.torrent.retry.useMutation({
    onSuccess: invalidateTorrentLists,
    onError: (err) => toast.error(err.message),
  });
  const forceResumeMutation = trpc.torrent.forceResume.useMutation({
    onSuccess: () => {
      invalidateTorrentLists();
      toast.success("Force resume sent");
    },
    onError: (err) => toast.error(err.message),
  });
  const forceRecheckMutation = trpc.torrent.forceRecheck.useMutation({
    onSuccess: () => {
      invalidateTorrentLists();
      toast.success("Force recheck sent");
    },
    onError: (err) => toast.error(err.message),
  });
  const forceReannounceMutation = trpc.torrent.forceReannounce.useMutation({
    onSuccess: () => {
      invalidateTorrentLists();
      toast.success("Force reannounce sent");
    },
    onError: (err) => toast.error(err.message),
  });
  const addMagnetMutation = trpc.torrent.addMagnet.useMutation({
    onSuccess: () => {
      invalidateTorrentLists();
      setMagnetDialogOpen(false);
      setMagnetLink("");
      toast.success("Magnetic link imported");
    },
    onError: (err) => toast.error(err.message),
  });
  const addTorrentFileMutation = trpc.torrent.addTorrentFile.useMutation({
    onSuccess: () => {
      invalidateTorrentLists();
      toast.success(".torrent imported");
    },
    onError: (err) => toast.error(err.message),
  });
  const importFromClientMutation = trpc.torrent.importFromClient.useMutation({
    onSuccess: (result) => {
      invalidateTorrentLists();
      toast.success(`Imported and linked to ${result.mediaTitle}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.torrent.delete.useMutation({
    onSuccess: () => {
      invalidateTorrentLists();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const advancedPending =
    forceResumeMutation.isPending ||
    forceRecheckMutation.isPending ||
    forceReannounceMutation.isPending;

  const clientItems = useMemo(
    () => (clientListQuery.data ?? []) as ClientTorrentItem[],
    [clientListQuery.data],
  );
  const filteredClientItems = useMemo(() => {
    if (!clientSearch.trim()) return clientItems;
    const q = clientSearch.trim().toLowerCase();
    return clientItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [clientItems, clientSearch]);
  const searchResults = useMemo(
    () => (tmdbSearchQuery.data?.results ?? []) as MediaSearchItem[],
    [tmdbSearchQuery.data],
  );

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

  const handleCopyMagnet = useCallback(
    (id: string) => {
      const target = torrents.find((item) => item.id === id);
      if (!target) return;
      const link = target.magnetUrl ??
        (target.hash ? buildFallbackMagnet(target.hash, target.title) : null);
      if (!link) {
        toast.error("This torrent has no magnetic link");
        return;
      }
      void navigator.clipboard
        .writeText(link)
        .then(() => toast.success("Magnetic link copied"))
        .catch(() => toast.error("Could not copy magnetic link"));
    },
    [torrents],
  );

  const handleImportMagnet = useCallback(() => {
    const trimmed = magnetLink.trim();
    if (!trimmed.startsWith("magnet:")) {
      toast.error("Use a valid magnetic link");
      return;
    }
    addMagnetMutation.mutate({ magnetUrl: trimmed });
  }, [magnetLink, addMagnetMutation]);

  const handleSelectTorrentFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openClientImportStep = useCallback((item: ClientTorrentItem) => {
    setSelectedClientTorrent(item);
    const inferredMode = inferImportModeFromName(item.name);
    setImportMatchMode(inferredMode);
    setTmdbSearch(sanitizeTorrentTitleForSearch(item.name));
    setSelectedMedia(null);
    setSeasonInput("");
    setEpisodeInput("");
    setImportStep("select-media");
  }, []);

  const handleTorrentFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") {
              reject(new Error("Invalid file content"));
              return;
            }
            const encoded = reader.result.split(",")[1];
            if (!encoded) {
              reject(new Error("Invalid file content"));
              return;
            }
            resolve(encoded);
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        await addTorrentFileMutation.mutateAsync({
          fileName: file.name,
          fileBase64: base64,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to import .torrent");
      }
    },
    [addTorrentFileMutation],
  );

  const handleImportFromClient = useCallback(async () => {
    if (!selectedClientTorrent) {
      toast.error("Choose a torrent first");
      return;
    }
    if (!selectedMedia) {
      toast.error("Choose the exact media on TMDB");
      return;
    }

    const downloadType =
      importMatchMode === "movie"
        ? "movie"
        : importMatchMode === "series"
          ? "season"
          : "episode";

    let seasonNumber: number | undefined;
    let episodeNumbers: number[] | undefined;

    if (importMatchMode === "series" && seasonInput.trim()) {
      const parsedSeason = Number(seasonInput);
      if (!Number.isInteger(parsedSeason) || parsedSeason <= 0) {
        toast.error("Season must be a positive number");
        return;
      }
      seasonNumber = parsedSeason;
    }

    if (importMatchMode === "episode") {
      const parsedSeason = Number(seasonInput);
      if (!Number.isInteger(parsedSeason) || parsedSeason <= 0) {
        toast.error("Season must be a positive number");
        return;
      }
      const parsedEpisodes = parseEpisodeNumbers(episodeInput);
      if (parsedEpisodes.length === 0) {
        toast.error("Enter at least one episode number");
        return;
      }
      seasonNumber = parsedSeason;
      episodeNumbers = parsedEpisodes;
    }

    await importFromClientMutation.mutateAsync({
      hash: selectedClientTorrent.hash,
      mediaExternalId: selectedMedia.externalId,
      mediaProvider: selectedMedia.provider,
      mediaType: selectedMedia.type,
      downloadType,
      seasonNumber,
      episodeNumbers,
    });
    setClientImportDialogOpen(false);
    resetClientImportDialog();
  }, [
    selectedClientTorrent,
    selectedMedia,
    importMatchMode,
    seasonInput,
    episodeInput,
    importFromClientMutation,
    resetClientImportDialog,
  ]);

  const filtered =
    statusFilter === "all"
      ? torrents
      : torrents.filter((t) => {
          const r = resolveState(t.status, t.live?.state, t.live?.progress);
          if (statusFilter === "downloading") return !r.isDownloaded && !r.canResume;
          if (statusFilter === "completed") return r.isDownloaded;
          if (statusFilter === "paused") return r.canResume && !r.isDownloaded;
          return true;
        });

  const counts = {
    all: torrents.length,
    downloading: torrents.filter((t) => {
      const r = resolveState(t.status, t.live?.state, t.live?.progress);
      return !r.isDownloaded && !r.canResume;
    }).length,
    completed: torrents.filter((t) => resolveState(t.status, t.live?.state, t.live?.progress).isDownloaded).length,
    paused: torrents.filter((t) => {
      const r = resolveState(t.status, t.live?.state, t.live?.progress);
      return r.canResume && !r.isDownloaded;
    }).length,
  };

  const importMenu = (
    <ResponsiveMenu
      trigger={(
        <Button variant="outline" size="sm" className="gap-2.5 rounded-xl px-4">
          <Upload className="h-4 w-4" />
          Import
        </Button>
      )}
      desktopContentClassName="w-64"
      sheetTitle="Import downloads"
      desktopContent={(
        <>
          <DropdownMenuItem className="gap-3 px-3 py-2.5 text-sm font-medium" onClick={handleSelectTorrentFile}>
            <Upload className="h-4 w-4" />
            Import .torrent
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-3 px-3 py-2.5 text-sm font-medium" onClick={() => setMagnetDialogOpen(true)}>
            <Link2 className="h-4 w-4" />
            Import magnetic link
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-3 px-3 py-2.5 text-sm font-medium"
            onClick={() => setClientImportDialogOpen(true)}
          >
            <Download className="h-4 w-4" />
            Import from qBittorrent
          </DropdownMenuItem>
        </>
      )}
      mobileContent={({ close }) => (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              handleSelectTorrentFile();
              close();
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80"
          >
            <Upload className="h-4 w-4 shrink-0" />
            Import .torrent
          </button>
          <button
            type="button"
            onClick={() => {
              setMagnetDialogOpen(true);
              close();
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            Import magnetic link
          </button>
          <button
            type="button"
            onClick={() => {
              setClientImportDialogOpen(true);
              close();
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent/80"
          >
            <Download className="h-4 w-4 shrink-0" />
            Import from qBittorrent
          </button>
        </div>
      )}
    />
  );

  return (
    <div className="w-full">
      <PageHeader
        title="Downloads"
        subtitle="Monitor and manage your active downloads."
        children={(
          <div className="mt-3 flex items-center gap-2 md:hidden">
            {importMenu}
          </div>
        )}
        action={(
          <div className="hidden items-center gap-2 md:flex">
            {importMenu}
          </div>
        )}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".torrent,application/x-bittorrent"
        onChange={handleTorrentFileChange}
      />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={STATUS_TABS.map(({ value, label }) => ({
            value,
            label,
            count: counts[value as keyof typeof counts],
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        {/* Content */}
        {isError ? (
          <StateMessage preset="error" onRetry={() => void utils.torrent.listLive.invalidate()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-5 rounded-2xl bg-muted/40 p-4">
                <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <StateMessage preset="emptyTorrents" />
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => (
              <TorrentCard
                key={t.id}
                torrent={t as Parameters<typeof TorrentCard>[0]["torrent"]}
                onPause={(id) => pauseMutation.mutate({ id })}
                onResume={(id) => resumeMutation.mutate({ id })}
                onRetry={(id) => retryMutation.mutate({ id })}
                onForceResume={(id) => forceResumeMutation.mutate({ id })}
                onForceRecheck={(id) => forceRecheckMutation.mutate({ id })}
                onForceReannounce={(id) => forceReannounceMutation.mutate({ id })}
                onCopyMagnet={handleCopyMagnet}
                onDelete={(id, title) => setDeleteTarget({ id, title })}
                pausePending={pauseMutation.isPending}
                resumePending={resumeMutation.isPending}
                retryPending={retryMutation.isPending}
                advancedPending={advancedPending}
              />
            ))}

            <div ref={sentinelRef} className="h-1" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasNextPage && !isFetchingNextPage && filtered.length > 0 && (
              <StateMessage preset="endOfItems" inline />
            )}
          </div>
        )}

        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={(id, deleteFiles, removeTorrent) =>
            deleteMutation.mutate({ id, deleteFiles, removeTorrent })
          }
          isPending={deleteMutation.isPending}
        />

        <Dialog open={magnetDialogOpen} onOpenChange={setMagnetDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-left">
              <DialogTitle>Import magnetic link</DialogTitle>
              <DialogDescription>
                Paste a magnetic link to add this download to qBittorrent and Canto tracking.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={magnetLink}
              onChange={(e) => setMagnetLink(e.target.value)}
              placeholder="magnet:?xt=urn:btih:..."
              className="min-h-28 rounded-xl border-none bg-accent text-sm ring-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setMagnetDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                onClick={handleImportMagnet}
                disabled={addMagnetMutation.isPending || !magnetLink.trim()}
              >
                {addMagnetMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={clientImportDialogOpen}
          onOpenChange={(open) => {
            setClientImportDialogOpen(open);
            if (!open) resetClientImportDialog();
          }}
        >
          <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-[80vh] md:max-h-[80vh] md:max-w-2xl md:rounded-[2rem]">
            <DialogHeader className="px-5 pt-6 pb-4 text-left">
              <DialogTitle>Import from qBittorrent</DialogTitle>
              <DialogDescription>
                {importStep === "select-torrent"
                  ? "Step 1/2 · Select a torrent from qBittorrent."
                  : "Step 2/2 · Search and select the exact media item."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5">
              {importStep === "select-torrent" ? (
                <>
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search torrents in qBittorrent..."
                      className={`${modalInputCn} pl-9`}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {clientListQuery.isLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <Skeleton key={idx} className="h-16 rounded-xl" />
                        ))}
                      </div>
                    ) : filteredClientItems.length === 0 ? (
                      <StateMessage preset="emptyTorrents" inline />
                    ) : (
                      <div className="space-y-2">
                        {filteredClientItems.map((item) => (
                          <div key={item.hash} className="rounded-xl border border-border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {item.name}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span>{getClientStateLabel(item.state, item.progress)}</span>
                                  <span>{Math.round(item.progress * 100)}%</span>
                                  {item.size > 0 && <span>{formatBytes(item.size)}</span>}
                                  {item.dlspeed > 0 && <span>↓ {formatSpeed(item.dlspeed)}</span>}
                                  {item.upspeed > 0 && <span>↑ {formatSpeed(item.upspeed)}</span>}
                                  {item.eta > 0 && item.eta < 8640000 && (
                                    <span>ETA {formatEta(item.eta)}</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="rounded-xl"
                                variant={item.tracked && item.trackedMediaId ? "outline" : "default"}
                                disabled={item.tracked && item.trackedMediaId != null}
                                onClick={() => openClientImportStep(item)}
                              >
                                {item.tracked && item.trackedMediaId ? "Imported" : "Select"}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-accent/40 p-3">
                    <p className="text-xs text-muted-foreground">Selected torrent</p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedClientTorrent?.name}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      variant={importMatchMode === "movie" ? "default" : "outline"}
                      onClick={() => {
                        setImportMatchMode("movie");
                        setSelectedMedia(null);
                      }}
                    >
                      Movie
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      variant={importMatchMode === "series" ? "default" : "outline"}
                      onClick={() => {
                        setImportMatchMode("series");
                        setSelectedMedia(null);
                      }}
                    >
                      Series
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      variant={importMatchMode === "episode" ? "default" : "outline"}
                      onClick={() => {
                        setImportMatchMode("episode");
                        setSelectedMedia(null);
                      }}
                    >
                      Episode
                    </Button>
                  </div>

                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={tmdbSearch}
                      onChange={(e) => setTmdbSearch(e.target.value)}
                      placeholder="Search on TMDB..."
                      className={`${modalInputCn} pl-9`}
                    />
                  </div>

                  {(importMatchMode === "series" || importMatchMode === "episode") && (
                    <div className={importMatchMode === "episode" ? "grid grid-cols-2 gap-2" : ""}>
                      <Input
                        value={seasonInput}
                        onChange={(e) => setSeasonInput(e.target.value)}
                        placeholder={
                          importMatchMode === "episode"
                            ? "Season"
                            : "Season (optional)"
                        }
                        className={modalInputCn}
                      />
                      {importMatchMode === "episode" && (
                        <Input
                          value={episodeInput}
                          onChange={(e) => setEpisodeInput(e.target.value)}
                          placeholder="Episode (e.g. 3 or 3,4)"
                          className={modalInputCn}
                        />
                      )}
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {tmdbSearchQuery.isLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <Skeleton key={idx} className="h-16 rounded-xl" />
                        ))}
                      </div>
                    ) : debouncedTmdbSearch.trim().length < 2 ? (
                      <StateMessage preset="emptySearch" inline />
                    ) : searchResults.length === 0 ? (
                      <StateMessage preset="emptySearch" inline />
                    ) : (
                      <div className="space-y-2">
                        {searchResults.map((result) => {
                          const isSelected =
                            selectedMedia?.externalId === result.externalId &&
                            selectedMedia.type === result.type;
                          return (
                            <button
                              key={`${result.provider}-${result.externalId}-${result.type}`}
                              type="button"
                              onClick={() => setSelectedMedia(result)}
                              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:bg-accent/40"
                              }`}
                            >
                              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                                {result.posterPath ? (
                                  <Image
                                    src={`https://image.tmdb.org/t/p/w342${result.posterPath}`}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    {result.type === "movie" ? (
                                      <Film className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <Tv className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {result.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {result.type === "movie" ? "Movie" : "Series"}
                                  {result.year ? ` · ${result.year}` : ""}
                                </p>
                              </div>
                              {isSelected ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setImportStep("select-torrent")}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl"
                      disabled={importFromClientMutation.isPending || !selectedMedia}
                      onClick={() => void handleImportFromClient()}
                    >
                      {importFromClientMutation.isPending ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
