"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Skeleton } from "@canto/ui/skeleton";
import { Badge } from "@canto/ui/badge";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  FolderSearch,
  Film,
  Tv,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { SettingsSection } from "~/components/settings/shared";

/* -------------------------------------------------------------------------- */
/*  OR Divider                                                                 */
/* -------------------------------------------------------------------------- */

function OrDivider(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-xs text-muted-foreground/40">or</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Relative time helper                                                       */
/* -------------------------------------------------------------------------- */

function timeAgo(dateStr: string | Date | null): string {
  if (!dateStr) return "Never";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* -------------------------------------------------------------------------- */
/*  Sync History Section                                                       */
/* -------------------------------------------------------------------------- */

function SyncHistorySection({ source }: { source: "jellyfin" | "plex" }): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "failed" | "imported" | "skipped">("all");
  const [page, setPage] = useState(1);
  const [editItem, setEditItem] = useState<{
    id: string;
    title: string;
    type: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tmdbIdInput, setTmdbIdInput] = useState("");

  const utils = trpc.useUtils();

  const syncedItemsQuery = trpc.sync.listSyncedItems.useQuery({
    source,
    result: filter === "all" ? undefined : filter,
    page,
    pageSize: 20,
  });
  const { data, isLoading } = syncedItemsQuery;

  const searchResults = trpc.sync.searchForSyncItem.useQuery(
    { query: searchQuery, type: (editItem?.type as "movie" | "show") ?? "movie" },
    { enabled: searchQuery.length > 1 && !!editItem },
  );

  const resolveItem = trpc.sync.resolveSyncItem.useMutation({
    onSuccess: (result) => {
      toast.success(`Matched to: ${result.suggestedName}`);
      setEditItem(null);
      setSearchQuery("");
      setTmdbIdInput("");
      void utils.sync.listSyncedItems.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <SettingsSection
      title="Sync History"
      description="Review and correct media matched from your server. Edit any item to fix incorrect matches."
    >
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "failed", "imported"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { setFilter(f); setPage(1); }}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {data && f === "all" && ` (${data.total})`}
          </button>
        ))}
      </div>

      {/* Cards */}
      {syncedItemsQuery.isError ? (
        <StateMessage preset="error" onRetry={() => syncedItemsQuery.refetch()} minHeight="120px" />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="divide-y divide-border/30">
            {data.items.map((item) => {
              const hasMedia = !!item.mediaId;
              const titleMismatch = hasMedia && item.mediaTitle && item.mediaTitle !== item.serverItemTitle;
              const mediaType = (item.mediaType ?? "movie") as string;

              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Poster */}
                  <div className="shrink-0">
                    {item.mediaPosterPath ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${item.mediaPosterPath}`}
                        alt=""
                        className="h-14 w-10 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-10 items-center justify-center rounded bg-muted/50">
                        {mediaType === "show" ? (
                          <Tv className="h-4 w-4 text-muted-foreground/40" />
                        ) : (
                          <Film className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Title info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-base font-medium text-foreground truncate">
                        {item.serverItemTitle}
                      </p>
                      {item.serverItemYear && (
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {item.serverItemYear}
                        </span>
                      )}
                    </div>
                    {titleMismatch ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground truncate">
                          {item.mediaTitle}
                          {item.mediaYear ? ` (${item.mediaYear})` : ""}
                        </p>
                      </div>
                    ) : item.result === "failed" ? (
                      <p className="text-sm text-destructive mt-0.5">
                        {item.reason ?? "Not matched"}
                      </p>
                    ) : null}
                  </div>

                  {/* Status + action */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.result === "failed" && (
                      <Badge variant="secondary" className="bg-destructive/10 text-destructive border-0 text-[10px]">
                        Failed
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditItem({
                          id: item.id,
                          title: item.serverItemTitle,
                          type: mediaType,
                        });
                        setSearchQuery(item.serverItemTitle);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <StateMessage preset="emptyGrid" minHeight="120px" />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Edit match dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) { setEditItem(null); setSearchQuery(""); setTmdbIdInput(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit match: {editItem?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* TMDB ID input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">TMDB ID</label>
              <div className="flex gap-2">
                <Input
                  value={tmdbIdInput}
                  onChange={(e) => setTmdbIdInput(e.target.value)}
                  placeholder="e.g. 12345"
                  className="h-10 rounded-xl border-none bg-muted/50 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
                />
                <Button
                  size="sm"
                  disabled={!tmdbIdInput || resolveItem.isPending}
                  onClick={() => {
                    if (editItem && tmdbIdInput) {
                      resolveItem.mutate({
                        syncItemId: editItem.id,
                        tmdbId: parseInt(tmdbIdInput, 10),
                        type: editItem.type as "movie" | "show",
                      });
                    }
                  }}
                >
                  {resolveItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Match"}
                </Button>
              </div>
            </div>

            <OrDivider />

            {/* Search by name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Search by name</label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search TMDB..."
                className="h-10 rounded-xl border-none bg-muted/50 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
              />
            </div>

            {/* Search results */}
            {searchResults.data && searchResults.data.results.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-border/40">
                {searchResults.data.results.slice(0, 10).map((result) => (
                  <button
                    key={`${result.externalId}-${result.type}`}
                    type="button"
                    onClick={() => {
                      if (editItem) {
                        resolveItem.mutate({
                          syncItemId: editItem.id,
                          tmdbId: result.externalId,
                          type: result.type as "movie" | "show",
                        });
                      }
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                  >
                    {result.posterPath ? (
                      <img src={`https://image.tmdb.org/t/p/w92${result.posterPath}`} alt="" className="h-12 w-8 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-8 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">N/A</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground">{result.year} · {result.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Library linking section                                                    */
/* -------------------------------------------------------------------------- */

function LibraryLinkingSection({ source }: { source: "jellyfin" | "plex" }): React.JSX.Element {
  const utils = trpc.useUtils();

  const libraries = trpc.sync.discoverServerLibraries.useQuery({ serverType: source });
  const addLink = trpc.folder.addServerLink.useMutation({
    onSuccess: () => {
      void utils.sync.discoverServerLibraries.invalidate();
      void utils.folder.listWithLinks.invalidate();
      toast.success("Sync enabled");
    },
    onError: () => toast.error("Failed to enable sync"),
  });

  const updateLink = trpc.folder.updateServerLink.useMutation({
    onSuccess: () => {
      void utils.sync.discoverServerLibraries.invalidate();
      void utils.folder.listWithLinks.invalidate();
    },
    onError: () => toast.error("Failed to update library"),
  });

  if (libraries.isLoading) {
    return (
      <div className="space-y-2 px-5 py-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (libraries.isError) {
    return (
      <div className="px-5 py-4">
        <StateMessage preset="error" onRetry={() => libraries.refetch()} minHeight="100px" />
      </div>
    );
  }

  const items = libraries.data ?? [];

  if (items.length === 0) {
    return (
      <div className="px-5 py-4">
        <StateMessage preset="emptyGrid" title="No libraries found" description="Scan libraries to discover server folders" minHeight="100px" />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30 rounded-xl border border-border/40 overflow-hidden">
      {items.map((lib) => {
        const hasLink = !!lib.linkId;

        return (
          <div
            key={lib.serverLibraryId}
            className="flex flex-col gap-2 px-5 py-3.5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="mt-0.5 shrink-0">
                  {lib.contentType === "movies" ? (
                    <Film className="h-4 w-4 text-blue-400" />
                  ) : (
                    <Tv className="h-4 w-4 text-purple-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{lib.serverLibraryName}</p>
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                      {lib.contentType === "movies" ? "Movies" : "Shows"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {lib.serverPath && (
                      <p className="text-xs text-muted-foreground/50 truncate">{lib.serverPath}</p>
                    )}
                    <span className="text-xs text-muted-foreground/40">
                      {hasLink ? `Last sync: ${timeAgo(lib.lastSyncedAt)}` : "Not synced"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 sm:ml-4">
                <Switch
                  checked={lib.syncEnabled}
                  onCheckedChange={(checked) => {
                    if (hasLink && lib.linkId) {
                      updateLink.mutate({ id: lib.linkId, syncEnabled: checked });
                    } else if (checked) {
                      addLink.mutate({
                        serverType: source,
                        serverLibraryId: lib.serverLibraryId,
                        serverLibraryName: lib.serverLibraryName,
                        contentType: lib.contentType as "movies" | "shows",
                        serverPath: lib.serverPath ?? undefined,
                        syncEnabled: true,
                      });
                    }
                  }}
                  disabled={updateLink.isPending || addLink.isPending}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Server library group                                                       */
/* -------------------------------------------------------------------------- */

function ServerLibraryGroup({
  source,
  enabled,
  isSyncingLibraries,
  onSyncLibraries,
}: {
  source: "jellyfin" | "plex";
  enabled: boolean;
  isSyncingLibraries: boolean;
  onSyncLibraries: () => void;
}): React.JSX.Element | null {
  const importMedia = trpc.sync.importMedia.useMutation({
    onSuccess: (data) => {
      if (data.started.jellyfin || data.started.plex) toast.success("Sync started");
      else toast.info("Sync already running");
    },
    onError: () => toast.error("Failed to start sync"),
  });

  if (!enabled) return null;

  return (
    <SettingsSection
      title="Reverse Sync"
      description="Import your existing collection from the server into Canto. Enabled libraries are scanned every 5 minutes for new content."
    >
      <div className="space-y-4">
        <LibraryLinkingSection source={source} />

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onSyncLibraries}
            disabled={isSyncingLibraries}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSyncingLibraries ? (
              <><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Scanning...</>
            ) : (
              "Not seeing a library? Rescan server"
            )}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => importMedia.mutate()}
            disabled={importMedia.isPending}
          >
            {importMedia.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Sync now
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Folder Scan section                                                        */
/* -------------------------------------------------------------------------- */

function FolderScanSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings } = trpc.settings.getAll.useQuery();
  const folderScanEnabled = allSettings?.["sync.folderScan.enabled"] === true;

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      void utils.settings.getAll.invalidate();
      toast.success("Folder scan setting updated");
    },
    onError: () => toast.error("Failed to update setting"),
  });

  const scanFolders = trpc.sync.scanFolders.useMutation({
    onSuccess: (data) => {
      if (data.started) toast.success("Folder scan started");
      else toast.info("Folder scan already running");
    },
    onError: () => toast.error("Failed to start folder scan"),
  });

  return (
    <SettingsSection
      title="Folder Scan"
      description="Detect existing media files in your library paths and match them to TMDB."
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <FolderSearch className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Scan libraries for existing media</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Periodically scan your library storage paths and match existing files to TMDB.
                  Detected media will be added to your library.
                </p>
              </div>
            </div>
            <Switch
              checked={folderScanEnabled}
              onCheckedChange={(checked) => setSetting.mutate({ key: "sync.folderScan.enabled", value: checked })}
              disabled={setSetting.isPending}
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/30 px-5 py-3.5">
            <p className="text-xs text-muted-foreground">
              {folderScanEnabled ? "Runs periodically in the background" : "Enable the toggle above for automatic scans"}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => scanFolders.mutate()}
              disabled={scanFolders.isPending}
            >
              {scanFolders.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Scan now
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main exported section                                                      */
/* -------------------------------------------------------------------------- */

export function MediaServerSyncSection({ serverType }: { serverType?: "jellyfin" | "plex" } = {}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const jellyfinEnabled = enabledServices?.jellyfin === true;
  const plexEnabled = enabledServices?.plex === true;

  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation({
    onSuccess: (data) => {
      void utils.folder.listWithLinks.invalidate();
      void utils.sync.discoverServerLibraries.invalidate();
      toast.success(`Synced ${data.length} Jellyfin libraries`);
    },
    onError: () => toast.error("Failed to sync Jellyfin libraries"),
  });
  const syncPlex = trpc.plex.syncLibraries.useMutation({
    onSuccess: (data) => {
      void utils.folder.listWithLinks.invalidate();
      void utils.sync.discoverServerLibraries.invalidate();
      toast.success(`Synced ${data.length} Plex libraries`);
    },
    onError: () => toast.error("Failed to sync Plex libraries"),
  });

  const showJellyfin = (!serverType || serverType === "jellyfin") && jellyfinEnabled;
  const showPlex = (!serverType || serverType === "plex") && plexEnabled;

  return (
    <>
      {showJellyfin && (
        <>
          <ServerLibraryGroup
            source="jellyfin"
            enabled={jellyfinEnabled}
            isSyncingLibraries={syncJellyfin.isPending}
            onSyncLibraries={() => syncJellyfin.mutate()}
          />
          <SyncHistorySection source="jellyfin" />
        </>
      )}
      {showPlex && (
        <>
          <ServerLibraryGroup
            source="plex"
            enabled={plexEnabled}
            isSyncingLibraries={syncPlex.isPending}
            onSyncLibraries={() => syncPlex.mutate()}
          />
          <SyncHistorySection source="plex" />
        </>
      )}
      {!serverType && <FolderScanSection />}
    </>
  );
}
