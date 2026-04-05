"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import { Switch } from "@canto/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Separator } from "@canto/ui/separator";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Settings2,
  Download,
  Server,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  HardDrive,
  MoreHorizontal,
  FolderInput,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDownloadLabel,
  qualityBadge,
  sourceBadge,
  resolveState,
} from "~/lib/torrent-utils";

/* ─── Types ─── */

interface PreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  mediaType: "movie" | "show";
  mediaTitle: string;
  currentLibraryId: string | null;
  continuousDownload: boolean;
}

const TABS = [
  { value: "preferences", label: "Preferences", icon: Settings2 },
  { value: "downloads", label: "Downloads", icon: Download },
  { value: "jellyfin", label: "Jellyfin", icon: Server },
  { value: "plex", label: "Plex", icon: Server },
  { value: "danger", label: "Danger", icon: AlertTriangle },
] as const;

type Tab = (typeof TABS)[number]["value"];

/* ─── Main Component ─── */

export function PreferencesModal({
  open,
  onOpenChange,
  mediaId,
  mediaType,
  mediaTitle,
  currentLibraryId,
  continuousDownload,
}: PreferencesModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("preferences");
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false);
  const [removeDeleteTorrent, setRemoveDeleteTorrent] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const router = useRouter();
  const utils = trpc.useUtils();

  // Reset all state when modal closes
  useEffect(() => {
    if (!open) {
      setActiveTab("preferences");
      setRemoveDeleteFiles(false);
      setRemoveDeleteTorrent(true);
      setConfirmDelete(false);
    }
  }, [open]);

  // ── Queries ──
  const { data: mediaData } = trpc.media.getById.useQuery(
    { id: mediaId },
    { staleTime: Infinity, enabled: open },
  );
  const { data: libraries } = trpc.folder.list.useQuery(undefined, {
    staleTime: Infinity,
    enabled: open,
  });
  const { data: availability } = trpc.sync.mediaAvailability.useQuery(
    { mediaId },
    { staleTime: Infinity, enabled: open },
  );
  const { data: mediaServers } = trpc.sync.mediaServers.useQuery(
    { mediaId },
    { staleTime: Infinity, enabled: open },
  );
  const { data: liveTorrents, isLoading: torrentsLoading } =
    trpc.torrent.listLiveByMedia.useQuery(
      { mediaId },
      {
        enabled: open,
        refetchInterval: (query) => {
          const items = query.state.data;
          if (!items) return 3000;
          return items.some(
            (t) => !resolveState(t.status, t.live?.state, t.live?.progress ?? t.progress).isDownloaded,
          )
            ? 3000
            : 30000;
        },
      },
    );
  const { data: mediaFiles } = trpc.media.listFiles.useQuery(
    { mediaId },
    { staleTime: 60_000, enabled: open },
  );
  const { data: mediaTorrents } = trpc.torrent.listByMedia.useQuery(
    { mediaId },
    { enabled: open },
  );

  // ── Mutations ──
  const invalidateMedia = useCallback(() => {
    void utils.media.getById.invalidate({ id: mediaId });
    void utils.media.getByExternal.invalidate();
  }, [utils, mediaId]);

  const setMediaLibrary = trpc.library.setMediaLibrary.useMutation({
    onSuccess: () => { invalidateMedia(); toast.success("Library updated"); },
    onError: (err) => toast.error(err.message),
  });
  const setContinuousDownload = trpc.library.setContinuousDownload.useMutation({
    onSuccess: () => { invalidateMedia(); toast.success("Auto-download updated"); },
    onError: (err) => toast.error(err.message),
  });
  const refreshMeta = trpc.media.updateMetadata.useMutation({
    onSuccess: () => { invalidateMedia(); toast.success("Metadata refreshed"); },
    onError: (err) => toast.error(err.message),
  });
  const removeFromLibrary = trpc.media.unmarkDownloaded.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success(`Removed "${mediaTitle}" from server`);
      onOpenChange(false);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success(`Deleted "${mediaTitle}"`);
      onOpenChange(false);
      router.push("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const invalidateTorrents = useCallback(() => {
    void utils.torrent.listLiveByMedia.invalidate({ mediaId });
    void utils.torrent.listByMedia.invalidate({ mediaId });
    void utils.media.listFiles.invalidate({ mediaId });
  }, [utils, mediaId]);

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
    onSuccess: () => { invalidateTorrents(); toast.success("Renamed"); },
    onError: (err) => toast.error(err.message),
  });
  const torrentMove = trpc.torrent.move.useMutation({
    onSuccess: () => { invalidateTorrents(); toast.success("Moved"); },
    onError: (err) => toast.error(err.message),
  });

  // ── Derived data ──
  const seasons = mediaData?.seasons ?? [];

  const filesByEpKey = useMemo(() => {
    const map = new Map<string, NonNullable<typeof mediaFiles>>();
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

  // ── Action handlers ──
  const handleDeleteSeason = (sn: number) => {
    const seasonTorrents = torrentsBySeason.get(sn) ?? [];
    for (const t of seasonTorrents) {
      torrentDelete.mutate({ id: t.id, deleteFiles: true, removeTorrent: true });
    }
    if (seasonTorrents.length > 0) toast.success(`Deleting ${seasonTorrents.length} torrent(s)`);
  };

  const handleRenameSeason = (sn: number) => {
    const seasonTorrents = torrentsBySeason.get(sn) ?? [];
    for (const t of seasonTorrents) {
      handleRenameTorrent(t.id, t.title);
    }
  };

  const handleMoveSeason = (sn: number) => {
    const seasonTorrents = torrentsBySeason.get(sn) ?? [];
    if (seasonTorrents.length === 0) return;
    const currentPath = seasonTorrents[0]?.contentPath ?? "";
    const newPath = window.prompt("Move season to:", currentPath);
    if (!newPath || newPath === currentPath) return;
    for (const t of seasonTorrents) {
      torrentMove.mutate({ id: t.id, newPath });
    }
  };

  const handleDeleteEpisode = (torrentId: string) => {
    torrentDelete.mutate({ id: torrentId, deleteFiles: true, removeTorrent: true });
  };

  const handleRenameTorrent = (torrentId: string, currentTitle: string) => {
    const newName = window.prompt("Rename to:", currentTitle);
    if (!newName || newName === currentTitle) return;
    torrentRename.mutate({ id: torrentId, newName });
  };

  const handleMoveTorrent = (torrentId: string, currentPath?: string | null) => {
    const newPath = window.prompt("Move to:", currentPath ?? "");
    if (!newPath) return;
    torrentMove.mutate({ id: torrentId, newPath });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div>
            <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
              {mediaTitle}
            </DialogDescription>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
          >
            <span className="text-lg leading-none text-foreground">×</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-muted/20 p-2">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  activeTab === tab.value
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  tab.value === "danger" && activeTab !== "danger" && "text-red-400 hover:text-red-400",
                )}
              >
                <tab.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    tab.value === "plex" && activeTab !== "plex" && "text-amber-400",
                    tab.value === "jellyfin" && activeTab !== "jellyfin" && "text-blue-400",
                  )}
                />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content — scrolls independently */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* ── Preferences ── */}
            {activeTab === "preferences" && (
              <div className="space-y-6">
                <SettingsRow label="Library" description="Where to store downloaded files">
                  <Select
                    value={currentLibraryId ?? "default"}
                    onValueChange={(v) => setMediaLibrary.mutate({ mediaId, libraryId: v === "default" ? null : v })}
                  >
                    <SelectTrigger className="w-48"><SelectValue placeholder="Default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      {libraries?.map((lib) => (
                        <SelectItem key={lib.id} value={lib.id}>{lib.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingsRow>
                {mediaType === "show" && (
                  <SettingsRow label="Auto-download new episodes" description="Automatically search and download new episodes as they air">
                    <Switch checked={continuousDownload} onCheckedChange={(c) => setContinuousDownload.mutate({ mediaId, enabled: c })} />
                  </SettingsRow>
                )}
                <SettingsRow label="Refresh metadata" description="Re-fetch title, images, and episode info from TMDB">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => refreshMeta.mutate({ id: mediaId })} disabled={refreshMeta.isPending}>
                    <RefreshCw className={cn("h-4 w-4", refreshMeta.isPending && "animate-spin")} />
                    {refreshMeta.isPending ? "Refreshing..." : "Refresh"}
                  </Button>
                </SettingsRow>
              </div>
            )}

            {/* ── Downloads ── */}
            {activeTab === "downloads" && (
              <ContentSeasonList
                mediaType={mediaType}
                seasons={seasons}
                loading={torrentsLoading}
                emptyText="No downloads for this title"
                getEpisodeItems={(sn, en) => {
                  const key = epKey(sn, en);
                  const files = filesByEpKey.get(key) ?? [];
                  const torrents = liveTorrents?.filter(
                    (t) => t.seasonNumber === sn && t.episodeNumbers?.includes(en),
                  ) ?? [];
                  return { files, torrents };
                }}
                getMovieItems={() => ({ files: movieFiles, torrents: liveTorrents ?? [] })}
                renderFileRow={(f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <HardDrive className="h-3 w-3 shrink-0 text-green-500" />
                    <span className="min-w-0 flex-1 truncate">{f.filePath.split("/").pop()}</span>
                    {f.sizeBytes ? <span>{formatBytes(f.sizeBytes)}</span> : null}
                    {f.quality && f.quality !== "unknown" && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">{f.quality}</Badge>
                    )}
                    <ItemActions
                      onDelete={() => toast.info("Delete file — coming soon")}
                      onRename={() => toast.info("Rename file — coming soon")}
                      onMove={() => toast.info("Move file — coming soon")}
                    />
                  </div>
                )}
                renderTorrentRow={(t) => (
                  <TorrentMiniRow
                    key={t.id}
                    torrent={t}
                    onPause={() => torrentPause.mutate({ id: t.id })}
                    onResume={() => torrentResume.mutate({ id: t.id })}
                    onRetry={() => torrentRetry.mutate({ id: t.id })}
                    onDelete={() => handleDeleteEpisode(t.id)}
                    onRename={() => handleRenameTorrent(t.id, t.title)}
                    onMove={() => handleMoveTorrent(t.id, t.contentPath)}
                  />
                )}
                seasonActions={(sn) => (
                  <SeasonActions
                    onDelete={() => handleDeleteSeason(sn)}
                    onRename={() => handleRenameSeason(sn)}
                    onMove={() => handleMoveSeason(sn)}
                    hasContent={(torrentsBySeason.get(sn)?.length ?? 0) > 0}
                  />
                )}
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

            {/* ── Danger ── */}
            {activeTab === "danger" && (
              <div className="space-y-6">
                <SettingsRow label="Remove from library" description="Remove this title from your library" />
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={removeDeleteFiles} onChange={(e) => setRemoveDeleteFiles(e.target.checked)} className="mt-0.5 rounded border-border" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Delete files from disk</p>
                      <p className="text-xs text-muted-foreground">Remove downloaded files permanently.</p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={removeDeleteTorrent} onChange={(e) => setRemoveDeleteTorrent(e.target.checked)} className="mt-0.5 rounded border-border" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Remove from download client</p>
                      <p className="text-xs text-muted-foreground">Remove from qBittorrent. Stops seeding.</p>
                    </div>
                  </label>
                  <Button
                    className="w-full bg-red-500 text-white hover:bg-red-600"
                    size="sm"
                    disabled={removeFromLibrary.isPending || torrentDelete.isPending}
                    onClick={async () => {
                      if (mediaTorrents?.length && (removeDeleteFiles || removeDeleteTorrent)) {
                        for (const t of mediaTorrents) {
                          await torrentDelete.mutateAsync({ id: t.id, deleteFiles: removeDeleteFiles, removeTorrent: removeDeleteTorrent }).catch(() => {});
                        }
                      }
                      removeFromLibrary.mutate({ id: mediaId });
                    }}
                  >
                    {removeFromLibrary.isPending ? "Removing..." : "Confirm Remove from Library"}
                  </Button>
                </div>
                <Separator />
                <SettingsRow label="Delete media" description="Permanently delete this title and all associated data. This cannot be undone.">
                  {!confirmDelete ? (
                    <Button variant="outline" size="sm" className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="bg-red-500 text-white hover:bg-red-600" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate({ id: mediaId })}>
                        {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </div>
                  )}
                </SettingsRow>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Sub-components                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function epKey(sn: number, en: number): string {
  return `S${String(sn).padStart(2, "0")}E${String(en).padStart(2, "0")}`;
}

/* ─── Item Actions Dropdown (Delete / Rename / Move) ─── */

function ItemActions({
  onDelete,
  onRename,
  onMove,
}: {
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
}) {
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
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-red-400 focus:text-red-400">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Season-level Actions ─── */

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
}) {
  if (!hasContent) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => e.stopPropagation()}>
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
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-red-400 focus:text-red-400">
          <Trash2 className="h-3.5 w-3.5" /> Delete Season
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Torrent Mini Row ─── */

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
    live: { state: string; progress: number; size: number; dlspeed: number; eta: number; seeds: number; peers: number } | null;
  };
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
}) {
  const state = resolveState(t.status, t.live?.state, t.live?.progress ?? t.progress);
  const pct = Math.round((t.live?.progress ?? t.progress) * 100);

  return (
    <div className="flex items-center gap-2 text-xs">
      <Download className="h-3 w-3 shrink-0 text-blue-400" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.title}</span>
      <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", state.color)}>{state.label}</Badge>
      {!state.isDownloaded && <span className="tabular-nums text-muted-foreground">{pct}%</span>}
      {(t.live?.size ?? t.fileSize) ? <span className="text-muted-foreground">{formatBytes(t.live?.size ?? t.fileSize ?? 0)}</span> : null}
      <div className="flex shrink-0 items-center gap-0.5">
        {state.canPause && (
          <button onClick={onPause} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pause className="h-3 w-3" /></button>
        )}
        {state.canResume && (
          <button onClick={onResume} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Play className="h-3 w-3" /></button>
        )}
        {state.canRetry && (
          <button onClick={onRetry} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCcw className="h-3 w-3" /></button>
        )}
        <ItemActions onDelete={onDelete} onRename={onRename} onMove={onMove} />
      </div>
    </div>
  );
}

/* ─── Content Season List (Downloads tab) ─── */

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
  live: { state: string; progress: number; size: number; dlspeed: number; eta: number; seeds: number; peers: number } | null;
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
  getEpisodeItems: (sn: number, en: number) => { files: FileItem[]; torrents: TorrentItem[] };
  getMovieItems: () => { files: FileItem[]; torrents: TorrentItem[] };
  renderFileRow: (f: FileItem) => React.ReactNode;
  renderTorrentRow: (t: TorrentItem) => React.ReactNode;
  seasonActions: (sn: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const toggle = (sn: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /></div>;
  }

  // Movie
  if (mediaType === "movie") {
    const { files, torrents } = getMovieItems();
    if (!files.length && !torrents.length) return <EmptyState text={emptyText} />;
    return (
      <div className="space-y-2">
        {files.map((f) => <div key={f.id} className="rounded-xl border border-border p-3">{renderFileRow(f)}</div>)}
        {torrents.map((t) => <div key={t.id} className="rounded-xl border border-border p-3">{renderTorrentRow(t)}</div>)}
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
          const { files, torrents } = getEpisodeItems(season.number, ep.number);
          return files.length > 0 || torrents.length > 0;
        });

        return (
          <div key={season.id} className="rounded-xl border border-border">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(season.number)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(season.number); } }}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
            >
              {isOpen
                ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="text-sm font-medium">
                {season.number === 0 ? "Specials" : `Season ${season.number}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {epsWithData.length > 0 ? `${epsWithData.length}/${eps.length}` : eps.length} episodes
              </span>
              <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                {seasonActions(season.number)}
              </div>
            </div>
            {isOpen && eps.length > 0 && (
              <div className="border-t border-border">
                {eps.map((ep) => {
                  const { files, torrents } = getEpisodeItems(season.number, ep.number);
                  const hasData = files.length > 0 || torrents.length > 0;
                  return (
                    <div key={ep.id} className="border-b border-border/50 px-4 py-2.5 last:border-b-0">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-10 shrink-0 text-xs font-medium text-muted-foreground">
                          E{String(ep.number).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm leading-snug", hasData ? "font-medium" : "text-muted-foreground/40")}>
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

/* ─── Server Season List (Jellyfin/Plex) ─── */

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
  availability: { sources: Array<{ type: string; resolution?: string | null; videoCodec?: string | null; episodeCount?: number }>; episodes: Record<string, Array<{ type: string; resolution?: string | null }>> } | undefined;
  serverLink: string | undefined;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const source = availability?.sources.find((s) => s.type === serverType);
  const episodes = availability?.episodes;

  const toggle = (sn: number) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(sn)) n.delete(sn); else n.add(sn); return n; });
  };

  const colorClass = color === "blue" ? "text-blue-400" : "text-amber-400";
  const bgClass = color === "blue" ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-amber-400";

  if (!source) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Server className={cn("h-8 w-8 opacity-40", colorClass)} />
        <p className="text-sm text-muted-foreground">Not available on {serverName}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          <Server className={cn("h-5 w-5", colorClass)} />
          <div>
            <p className="text-sm font-medium">{serverName}</p>
            <p className="text-xs text-muted-foreground">
              {source.resolution ?? "Available"}
              {source.videoCodec && ` · ${source.videoCodec}`}
              {mediaType === "show" && source.episodeCount != null && ` · ${source.episodeCount} episodes`}
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

      {/* Season/episode breakdown */}
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
              <div key={season.id} className="rounded-xl border border-border">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(season.number)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(season.number); } }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="text-sm font-medium">
                    {season.number === 0 ? "Specials" : `Season ${season.number}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {availableEps.length}/{eps.length} episodes
                  </span>
                  {availableEps.length > 0 && (
                    <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => toast.info("Rename season — coming soon")} className="gap-2 text-xs">
                            <Pencil className="h-3.5 w-3.5" /> Rename Season
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info("Move season — coming soon")} className="gap-2 text-xs">
                            <FolderInput className="h-3.5 w-3.5" /> Move Season
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info("Delete season — coming soon")} className="gap-2 text-xs text-red-400 focus:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" /> Delete Season
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
                {isOpen && eps.length > 0 && (
                  <div className="border-t border-border">
                    {eps.map((ep) => {
                      const key = epKey(season.number, ep.number);
                      const epAvail = episodes?.[key]?.filter((a) => a.type === serverType);
                      const isAvailable = epAvail && epAvail.length > 0;
                      const res = epAvail?.[0]?.resolution;
                      return (
                        <div key={ep.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0">
                          <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
                            E{String(ep.number).padStart(2, "0")}
                          </span>
                          <p className={cn("min-w-0 flex-1 text-sm leading-snug", isAvailable ? "font-medium" : "text-muted-foreground/40")}>
                            {ep.title ?? `Episode ${ep.number}`}
                          </p>
                          {isAvailable && (
                            <>
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", bgClass)}>
                                {res ?? "Available"}
                              </span>
                              <ItemActions
                                onDelete={() => toast.info("Delete episode — coming soon")}
                                onRename={() => toast.info("Rename episode — coming soon")}
                                onMove={() => toast.info("Move episode — coming soon")}
                              />
                            </>
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

/* ─── Shared ─── */

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <Download className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
