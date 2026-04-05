"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import { Separator } from "@canto/ui/separator";
import { Skeleton } from "@canto/ui/skeleton";
import { Switch } from "@canto/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FolderInput,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import {
  formatBytes,
  resolveState,
  qualityBadge,
  sourceBadge,
} from "~/lib/torrent-utils";

/* ─── Tabs ─── */

const TABS = [
  { value: "preferences", label: "Preferences" },
  { value: "downloads", label: "Torrents" },
  { value: "jellyfin", label: "Jellyfin" },
  { value: "plex", label: "Plex" },
  { value: "danger", label: "Danger Zone" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/* ─── Helpers ─── */

function epKey(sn: number, en: number): string {
  return `S${String(sn).padStart(2, "0")}E${String(en).padStart(2, "0")}`;
}

/* ─── Page ─── */

interface ManagePageProps {
  params: Promise<{ id: string }>;
}

export default function ManagePage({
  params,
}: ManagePageProps): React.JSX.Element {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";

  const [activeTab, setActiveTab] = useState<Tab>("preferences");
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false);
  const [removeDeleteTorrent, setRemoveDeleteTorrent] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const utils = trpc.useUtils();

  // ── Queries ──
  const { data: media, isLoading } = trpc.media.getById.useQuery({ id });
  const { data: libraries } = trpc.folder.list.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: availability } = trpc.sync.mediaAvailability.useQuery(
    { mediaId: id },
    { staleTime: Infinity },
  );
  const { data: mediaServers } = trpc.sync.mediaServers.useQuery(
    { mediaId: id },
    { staleTime: Infinity },
  );
  const { data: liveTorrents, isLoading: torrentsLoading } =
    trpc.torrent.listLiveByMedia.useQuery(
      { mediaId: id },
      {
        refetchInterval: (query) => {
          const items = query.state.data;
          if (!items) return 3000;
          return items.some(
            (t) =>
              !resolveState(
                t.status,
                t.live?.state,
                t.live?.progress ?? t.progress,
              ).isDownloaded,
          )
            ? 3000
            : 30000;
        },
      },
    );
  const { data: mediaFiles } = trpc.media.listFiles.useQuery(
    { mediaId: id },
    { staleTime: 60_000 },
  );
  const { data: mediaTorrents } = trpc.torrent.listByMedia.useQuery({
    mediaId: id,
  });

  useEffect(() => {
    if (media?.title) {
      document.title = `Manage: ${media.title} \u2014 Canto`;
    }
  }, [media?.title]);

  // ── Mutations ──
  const invalidateMedia = useCallback(() => {
    void utils.media.getById.invalidate({ id });
    void utils.media.getByExternal.invalidate();
  }, [utils, id]);

  const setMediaLibrary = trpc.library.setMediaLibrary.useMutation({
    onSuccess: () => {
      invalidateMedia();
      toast.success("Library updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const syncTvdb = trpc.media.syncTvdbSeasons.useMutation({
    onSuccess: () => {
      invalidateMedia();
      toast.success("TVDB seasons synced");
    },
    onError: (err) => toast.error(err.message),
  });
  const setContinuousDownload =
    trpc.library.setContinuousDownload.useMutation({
      onSuccess: () => {
        invalidateMedia();
        toast.success("Auto-download updated");
      },
      onError: (err) => toast.error(err.message),
    });
  const refreshMeta = trpc.media.updateMetadata.useMutation({
    onSuccess: () => {
      invalidateMedia();
      toast.success("Metadata refreshed");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeFromServer = trpc.media.unmarkDownloaded.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Removed from server");
      router.push(`/media/${id}`);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const markDownloaded = trpc.media.markDownloaded.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Marked as in library");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Media deleted");
      router.push("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const invalidateTorrents = useCallback(() => {
    void utils.torrent.listLiveByMedia.invalidate({ mediaId: id });
    void utils.torrent.listByMedia.invalidate({ mediaId: id });
    void utils.media.listFiles.invalidate({ mediaId: id });
  }, [utils, id]);

  const torrentPause = trpc.torrent.pause.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentResume = trpc.torrent.resume.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentDelete = trpc.torrent.delete.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentRetry = trpc.torrent.retry.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentRename = trpc.torrent.rename.useMutation({
    onSuccess: () => {
      invalidateTorrents();
      toast.success("Renamed");
    },
    onError: (err) => toast.error(err.message),
  });
  const torrentMove = trpc.torrent.move.useMutation({
    onSuccess: () => {
      invalidateTorrents();
      toast.success("Moved");
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Derived ──
  const seasons = media?.seasons ?? [];
  const mediaType = (media?.type ?? "movie") as "movie" | "show";

  const filesByEpKey = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof mediaFiles>
    >();
    if (!mediaFiles) return map;
    for (const f of mediaFiles) {
      const sn = f.episode?.season?.number;
      const en = f.episode?.number;
      if (sn == null || en == null) continue;
      const key = epKey(sn, en);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [mediaFiles]);

  const movieFiles = useMemo(
    () => mediaFiles?.filter((f) => !f.episode) ?? [],
    [mediaFiles],
  );

  const torrentsBySeason = useMemo(() => {
    const map = new Map<number, NonNullable<typeof liveTorrents>>();
    if (!liveTorrents) return map;
    for (const t of liveTorrents) {
      const sn = t.seasonNumber ?? -1;
      if (!map.has(sn)) map.set(sn, []);
      map.get(sn)!.push(t);
    }
    return map;
  }, [liveTorrents]);

  // ── Handlers ──
  const handleRenameTorrent = (
    torrentId: string,
    currentTitle: string,
  ): void => {
    const newName = window.prompt("Rename to:", currentTitle);
    if (!newName || newName === currentTitle) return;
    torrentRename.mutate({ id: torrentId, newName });
  };

  const handleMoveTorrent = (
    torrentId: string,
    currentPath?: string | null,
  ): void => {
    const newPath = window.prompt("Move to:", currentPath ?? "");
    if (!newPath) return;
    torrentMove.mutate({ id: torrentId, newPath });
  };

  // ── Guards ──
  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">
          This page is only available to administrators.
        </p>
      </div>
    );
  }

  if (isLoading || !media) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader title={media.title} subtitle="Manage media settings" />

      <div className="px-4 pt-6 pb-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={TABS.map((t) => ({ value: t.value, label: t.label }))}
          value={activeTab}
          onChange={(v) => setActiveTab(v as Tab)}
        />
      </div>

      <div className="px-4 pb-12 pt-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="w-full">
          {/* ── Preferences ── */}
          {activeTab === "preferences" && (
            <div className="space-y-6">
              <SettingsRow
                label="Library"
                description="Where to store downloaded files"
              >
                <Select
                  value={media.libraryId ?? "default"}
                  onValueChange={(v) =>
                    setMediaLibrary.mutate({
                      mediaId: id,
                      libraryId: v === "default" ? null : v,
                    })
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    {libraries?.map((lib) => (
                      <SelectItem key={lib.id} value={lib.id}>
                        {lib.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>
              {mediaType === "show" && (
                <SettingsRow
                  label="Auto-download new episodes"
                  description="Automatically search and download new episodes as they air"
                >
                  <Switch
                    checked={media.continuousDownload}
                    onCheckedChange={(c) =>
                      setContinuousDownload.mutate({ mediaId: id, enabled: c })
                    }
                  />
                </SettingsRow>
              )}
              <SettingsRow
                label="Refresh metadata"
                description="Re-fetch title, images, and episode info from the provider"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => refreshMeta.mutate({ id })}
                  disabled={refreshMeta.isPending}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      refreshMeta.isPending && "animate-spin",
                    )}
                  />
                  {refreshMeta.isPending ? "Refreshing..." : "Refresh"}
                </Button>
              </SettingsRow>
              {mediaType === "show" && (
                  <SettingsRow
                    label="Sync TVDB Seasons"
                    description="Use TVDB for accurate season splits and absolute episode numbering"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => syncTvdb.mutate({ id })}
                      disabled={syncTvdb.isPending}
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          syncTvdb.isPending && "animate-spin",
                        )}
                      />
                      {syncTvdb.isPending ? "Syncing..." : "Sync"}
                    </Button>
                  </SettingsRow>
                )}
            </div>
          )}

          {/* ── Torrents ── */}
          {activeTab === "downloads" && (
            <ContentSeasonList
              mediaType={mediaType}
              seasons={seasons}
              loading={torrentsLoading}
              emptyText="No downloads for this title"
              getEpisodeItems={(sn, en) => {
                const key = epKey(sn, en);
                const files = filesByEpKey.get(key) ?? [];
                const torrents =
                  liveTorrents?.filter(
                    (t) =>
                      t.seasonNumber === sn &&
                      t.episodeNumbers?.includes(en),
                  ) ?? [];
                return { files, torrents };
              }}
              getMovieItems={() => ({
                files: movieFiles,
                torrents: liveTorrents ?? [],
              })}
              renderFileRow={(f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <HardDrive className="h-3 w-3 shrink-0 text-green-500" />
                  <span className="min-w-0 flex-1 truncate">
                    {f.filePath.split("/").pop()}
                  </span>
                  {f.sizeBytes ? <span>{formatBytes(f.sizeBytes)}</span> : null}
                  {f.quality && f.quality !== "unknown" && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      {f.quality}
                    </Badge>
                  )}
                </div>
              )}
              renderTorrentRow={(t) => (
                <TorrentMiniRow
                  key={t.id}
                  torrent={t}
                  onPause={() => torrentPause.mutate({ id: t.id })}
                  onResume={() => torrentResume.mutate({ id: t.id })}
                  onRetry={() => torrentRetry.mutate({ id: t.id })}
                  onDelete={() =>
                    torrentDelete.mutate({
                      id: t.id,
                      deleteFiles: true,
                      removeTorrent: true,
                    })
                  }
                  onRename={() => handleRenameTorrent(t.id, t.title)}
                  onMove={() => handleMoveTorrent(t.id, t.contentPath)}
                />
              )}
              seasonActions={(sn) => {
                const seasonTorrents = torrentsBySeason.get(sn) ?? [];
                return (
                  <SeasonActions
                    hasContent={seasonTorrents.length > 0}
                    onDelete={() => {
                      for (const t of seasonTorrents)
                        torrentDelete.mutate({
                          id: t.id,
                          deleteFiles: true,
                          removeTorrent: true,
                        });
                      if (seasonTorrents.length > 0)
                        toast.success(
                          `Deleting ${seasonTorrents.length} torrent(s)`,
                        );
                    }}
                    onRename={() => {
                      for (const t of seasonTorrents)
                        handleRenameTorrent(t.id, t.title);
                    }}
                    onMove={() => {
                      if (seasonTorrents.length === 0) return;
                      const currentPath =
                        seasonTorrents[0]?.contentPath ?? "";
                      const newPath = window.prompt(
                        "Move season to:",
                        currentPath,
                      );
                      if (!newPath || newPath === currentPath) return;
                      for (const t of seasonTorrents)
                        torrentMove.mutate({ id: t.id, newPath });
                    }}
                  />
                );
              }}
            />
          )}

          {/* ── Jellyfin ── */}
          {activeTab === "jellyfin" && (
            <ServerSeasonList
              serverName="Jellyfin"
              serverType="jellyfin"
              color="blue"
              mediaType={mediaType}
              seasons={seasons}
              availability={availability}
              serverLink={mediaServers?.jellyfin?.url}
            />
          )}

          {/* ── Plex ── */}
          {activeTab === "plex" && (
            <ServerSeasonList
              serverName="Plex"
              serverType="plex"
              color="amber"
              mediaType={mediaType}
              seasons={seasons}
              availability={availability}
              serverLink={mediaServers?.plex?.url}
            />
          )}

          {/* ── Danger Zone ── */}
          {activeTab === "danger" && (
            <div className="space-y-6">
              {!media.downloaded && (
                <>
                  <SettingsRow
                    label="Mark as in library"
                    description="Mark this media as downloaded and add to server library"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={markDownloaded.isPending}
                      onClick={() => markDownloaded.mutate({ id })}
                    >
                      {markDownloaded.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Mark as in library
                    </Button>
                  </SettingsRow>
                  <Separator />
                </>
              )}
              <SettingsRow
                label="Remove from server"
                description="Un-mark this media as downloaded and remove from server library"
              />
              <div className="space-y-3 rounded-xl border border-border/60 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={removeDeleteFiles}
                    onChange={(e) => setRemoveDeleteFiles(e.target.checked)}
                    className="mt-0.5 rounded border-border"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Delete files from disk
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Remove downloaded files permanently.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={removeDeleteTorrent}
                    onChange={(e) =>
                      setRemoveDeleteTorrent(e.target.checked)
                    }
                    className="mt-0.5 rounded border-border"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Remove from download client
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Remove from qBittorrent. Stops seeding.
                    </p>
                  </div>
                </label>
                <Button
                  className="w-full bg-red-500 text-white hover:bg-red-600"
                  size="sm"
                  disabled={
                    removeFromServer.isPending || torrentDelete.isPending
                  }
                  onClick={async () => {
                    if (
                      mediaTorrents?.length &&
                      (removeDeleteFiles || removeDeleteTorrent)
                    ) {
                      for (const t of mediaTorrents) {
                        await torrentDelete
                          .mutateAsync({
                            id: t.id,
                            deleteFiles: removeDeleteFiles,
                            removeTorrent: removeDeleteTorrent,
                          })
                          .catch(() => {});
                      }
                    }
                    removeFromServer.mutate({ id });
                  }}
                >
                  {removeFromServer.isPending
                    ? "Removing..."
                    : "Confirm Remove from Server"}
                </Button>
              </div>
              <Separator />
              <SettingsRow
                label="Delete media"
                description="Permanently delete this title and all associated data. This cannot be undone."
              >
                {!confirmDelete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-red-500 text-white hover:bg-red-600"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate({ id })}
                    >
                      {deleteMutation.isPending
                        ? "Deleting..."
                        : "Confirm Delete"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </SettingsRow>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Sub-components (inlined from preferences-modal)                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function ItemActions({
  onDelete,
  onRename,
  onMove,
}: {
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={onRename} className="gap-2 text-xs">
          <Pencil className="h-3.5 w-3.5" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMove} className="gap-2 text-xs">
          <FolderInput className="h-3.5 w-3.5" /> Move
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-xs text-red-400 focus:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SeasonActions({
  onDelete,
  onRename,
  onMove,
  hasContent,
}: {
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
  hasContent: boolean;
}): React.JSX.Element | null {
  if (!hasContent) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename} className="gap-2 text-xs">
          <Pencil className="h-3.5 w-3.5" /> Rename Season
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMove} className="gap-2 text-xs">
          <FolderInput className="h-3.5 w-3.5" /> Move Season
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-xs text-red-400 focus:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Season
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TorrentMiniRow({
  torrent: t,
  onPause,
  onResume,
  onRetry,
  onDelete,
  onRename,
  onMove,
}: {
  torrent: {
    id: string;
    title: string;
    status: string;
    quality: string;
    source: string;
    progress: number;
    fileSize: number | null;
    contentPath: string | null;
    live: {
      state: string;
      progress: number;
      size: number;
      dlspeed: number;
      eta: number;
      seeds: number;
      peers: number;
    } | null;
  };
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
}): React.JSX.Element {
  const state = resolveState(
    t.status,
    t.live?.state,
    t.live?.progress ?? t.progress,
  );
  const pct = Math.round((t.live?.progress ?? t.progress) * 100);

  return (
    <div className="flex items-center gap-2 text-xs">
      <Download className="h-3 w-3 shrink-0 text-blue-400" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {t.title}
      </span>
      <Badge
        variant="outline"
        className={cn("h-4 px-1 text-[9px]", state.color)}
      >
        {state.label}
      </Badge>
      {!state.isDownloaded && (
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      )}
      {(t.live?.size ?? t.fileSize) ? (
        <span className="text-muted-foreground">
          {formatBytes(t.live?.size ?? t.fileSize ?? 0)}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5">
        {state.canPause && (
          <button
            onClick={onPause}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pause className="h-3 w-3" />
          </button>
        )}
        {state.canResume && (
          <button
            onClick={onResume}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Play className="h-3 w-3" />
          </button>
        )}
        {state.canRetry && (
          <button
            onClick={onRetry}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
        <ItemActions onDelete={onDelete} onRename={onRename} onMove={onMove} />
      </div>
    </div>
  );
}

interface SeasonData {
  id: string;
  number: number;
  name: string | null;
  episodes: Array<{ id: string; number: number; title: string | null }>;
}

interface FileItem {
  id: string;
  filePath: string;
  quality: string | null;
  source: string | null;
  sizeBytes: number | null;
}

interface TorrentItem {
  id: string;
  title: string;
  status: string;
  quality: string;
  source: string;
  progress: number;
  fileSize: number | null;
  contentPath: string | null;
  live: {
    state: string;
    progress: number;
    size: number;
    dlspeed: number;
    eta: number;
    seeds: number;
    peers: number;
  } | null;
}

function ContentSeasonList({
  mediaType,
  seasons,
  loading,
  emptyText,
  getEpisodeItems,
  getMovieItems,
  renderFileRow,
  renderTorrentRow,
  seasonActions,
}: {
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  loading: boolean;
  emptyText: string;
  getEpisodeItems: (
    sn: number,
    en: number,
  ) => { files: FileItem[]; torrents: TorrentItem[] };
  getMovieItems: () => { files: FileItem[]; torrents: TorrentItem[] };
  renderFileRow: (f: FileItem) => React.ReactNode;
  renderTorrentRow: (t: TorrentItem) => React.ReactNode;
  seasonActions: (sn: number) => React.ReactNode;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggle = (sn: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    );
  }

  if (mediaType === "movie") {
    const { files, torrents } = getMovieItems();
    if (!files.length && !torrents.length)
      return <EmptyState text={emptyText} />;
    return (
      <div className="space-y-2">
        {files.map((f) => (
          <div key={f.id} className="rounded-xl border border-border p-3">
            {renderFileRow(f)}
          </div>
        ))}
        {torrents.map((t) => (
          <div key={t.id} className="rounded-xl border border-border p-3">
            {renderTorrentRow(t)}
          </div>
        ))}
      </div>
    );
  }

  if (!seasons.length) return <EmptyState text={emptyText} />;

  return (
    <div className="space-y-2">
      {seasons.map((season) => {
        const isOpen = expanded.has(season.number);
        const eps = season.episodes ?? [];
        const epsWithData = eps.filter((ep) => {
          const { files, torrents } = getEpisodeItems(
            season.number,
            ep.number,
          );
          return files.length > 0 || torrents.length > 0;
        });

        return (
          <div key={season.id} className="rounded-xl border border-border">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(season.number)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(season.number);
                }
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {season.number === 0
                  ? "Specials"
                  : `Season ${season.number}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {epsWithData.length > 0
                  ? `${epsWithData.length}/${eps.length}`
                  : eps.length}{" "}
                episodes
              </span>
              <div
                className="ml-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {seasonActions(season.number)}
              </div>
            </div>
            {isOpen && eps.length > 0 && (
              <div className="border-t border-border">
                {eps.map((ep) => {
                  const { files, torrents } = getEpisodeItems(
                    season.number,
                    ep.number,
                  );
                  const hasData = files.length > 0 || torrents.length > 0;
                  return (
                    <div
                      key={ep.id}
                      className="border-b border-border/50 px-4 py-2.5 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-10 shrink-0 text-xs font-medium text-muted-foreground">
                          E{String(ep.number).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              hasData
                                ? "font-medium"
                                : "text-muted-foreground/40",
                            )}
                          >
                            {ep.title ?? `Episode ${ep.number}`}
                          </p>
                          {hasData && (
                            <div className="mt-1.5 space-y-1">
                              {files.map((f) => renderFileRow(f))}
                              {torrents.map((t) => renderTorrentRow(t))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServerSeasonList({
  serverName,
  serverType,
  color,
  mediaType,
  seasons,
  availability,
  serverLink,
}: {
  serverName: string;
  serverType: string;
  color: "blue" | "amber";
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  availability:
    | {
        sources: Array<{
          type: string;
          resolution?: string | null;
          videoCodec?: string | null;
          episodeCount?: number;
        }>;
        episodes: Record<
          string,
          Array<{ type: string; resolution?: string | null }>
        >;
      }
    | undefined;
  serverLink: string | undefined;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const source = availability?.sources.find((s) => s.type === serverType);
  const episodes = availability?.episodes;
  const toggle = (sn: number): void => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(sn)) n.delete(sn);
      else n.add(sn);
      return n;
    });
  };

  const colorClass = color === "blue" ? "text-blue-400" : "text-amber-400";
  const bgClass =
    color === "blue"
      ? "bg-blue-500/15 text-blue-400"
      : "bg-amber-500/15 text-amber-400";

  if (!source) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Server className={cn("h-8 w-8 opacity-40", colorClass)} />
        <p className="text-sm text-muted-foreground">
          Not available on {serverName}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          <Server className={cn("h-5 w-5", colorClass)} />
          <div>
            <p className="text-sm font-medium">{serverName}</p>
            <p className="text-xs text-muted-foreground">
              {source.resolution ?? "Available"}
              {source.videoCodec && ` · ${source.videoCodec}`}
              {mediaType === "show" &&
                source.episodeCount != null &&
                ` · ${source.episodeCount} episodes`}
            </p>
          </div>
        </div>
        {serverLink && (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href={serverLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </Button>
        )}
      </div>

      {mediaType === "show" && seasons.length > 0 && (
        <div className="space-y-2">
          {seasons.map((season) => {
            const isOpen = expanded.has(season.number);
            const eps = season.episodes ?? [];
            const availableEps = eps.filter((ep) => {
              const key = epKey(season.number, ep.number);
              return episodes?.[key]?.some((a) => a.type === serverType);
            });

            return (
              <div
                key={season.id}
                className="rounded-xl border border-border"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(season.number)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(season.number);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {season.number === 0
                      ? "Specials"
                      : `Season ${season.number}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {availableEps.length}/{eps.length} episodes
                  </span>
                </div>
                {isOpen && eps.length > 0 && (
                  <div className="border-t border-border">
                    {eps.map((ep) => {
                      const key = epKey(season.number, ep.number);
                      const epAvail = episodes?.[key]?.filter(
                        (a) => a.type === serverType,
                      );
                      const isAvailable = epAvail && epAvail.length > 0;
                      const res = epAvail?.[0]?.resolution;
                      return (
                        <div
                          key={ep.id}
                          className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0"
                        >
                          <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
                            E{String(ep.number).padStart(2, "0")}
                          </span>
                          <p
                            className={cn(
                              "min-w-0 flex-1 text-sm leading-snug",
                              isAvailable
                                ? "font-medium"
                                : "text-muted-foreground/40",
                            )}
                          >
                            {ep.title ?? `Episode ${ep.number}`}
                          </p>
                          {isAvailable && (
                            <span
                              className={cn(
                                "rounded-xl px-2 py-0.5 text-[10px] font-medium",
                                bgClass,
                              )}
                            >
                              {res ?? "Available"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <Download className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
