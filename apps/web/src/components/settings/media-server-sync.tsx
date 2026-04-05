"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Loader2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  SkipForward,
  FolderSearch,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { SettingsSection } from "~/components/settings/shared";

/* -------------------------------------------------------------------------- */
/*  Animated collapse                                                          */
/* -------------------------------------------------------------------------- */

function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, [open, children]);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: open ? height : 0, opacity: open ? 1 : 0 }}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

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
/*  Synced items table                                                         */
/* -------------------------------------------------------------------------- */

function SyncedItemsTable({ source }: { source?: "jellyfin" | "plex" }): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "failed" | "imported" | "skipped">("all");
  const [page, setPage] = useState(1);
  const [fixDialogItem, setFixDialogItem] = useState<{ id: string; title: string } | null>(null);
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
    { query: searchQuery },
    { enabled: searchQuery.length > 1 },
  );

  const resolveItem = trpc.sync.resolveSyncItem.useMutation({
    onSuccess: (result) => {
      toast.success(`Matched! Suggested name: ${result.suggestedName}`);
      setFixDialogItem(null);
      setSearchQuery("");
      setTmdbIdInput("");
      void utils.sync.listSyncedItems.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const statusIcon = (result: string): React.JSX.Element => {
    if (result === "imported") return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (result === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    return <SkipForward className="h-3.5 w-3.5 text-muted-foreground/50" />;
  };

  return (
    <>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "failed", "imported", "skipped"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { setFilter(f); setPage(1); }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {data && f === "all" && ` (${data.total})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {syncedItemsQuery.isError ? (
        <StateMessage preset="error" onRetry={() => syncedItemsQuery.refetch()} minHeight="120px" />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="divide-y divide-border/30">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {statusIcon(item.result)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.serverItemTitle}</p>
                    {item.serverItemYear && (
                      <p className="text-xs text-muted-foreground">{item.serverItemYear}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.reason && (
                    <span className="text-xs text-muted-foreground/50 max-w-[180px] truncate hidden sm:block">{item.reason}</span>
                  )}
                  {item.result === "failed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => {
                        setFixDialogItem({ id: item.id, title: item.serverItemTitle });
                        setSearchQuery(item.serverItemTitle);
                      }}
                    >
                      Fix match
                    </Button>
                  )}
                </div>
              </div>
            ))}
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

      {/* Fix match dialog */}
      <Dialog open={!!fixDialogItem} onOpenChange={(open) => { if (!open) { setFixDialogItem(null); setSearchQuery(""); setTmdbIdInput(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fix match: {fixDialogItem?.title}</DialogTitle>
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
                    if (fixDialogItem && tmdbIdInput) {
                      resolveItem.mutate({ syncItemId: fixDialogItem.id, tmdbId: parseInt(tmdbIdInput, 10), type: "movie" });
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
                      if (fixDialogItem) {
                        resolveItem.mutate({
                          syncItemId: fixDialogItem.id,
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
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Server library group                                                       */
/* -------------------------------------------------------------------------- */

function ServerLibraryGroup({
  server,
  source,
  enabled,
  isSyncingLibraries,
  onSyncLibraries,
}: {
  server: string;
  source: "jellyfin" | "plex";
  enabled: boolean;
  isSyncingLibraries: boolean;
  onSyncLibraries: () => void;
}): React.JSX.Element | null {
  const [showSyncedItems, setShowSyncedItems] = useState(false);
  const importMedia = trpc.sync.importMedia.useMutation({
    onSuccess: (data) => {
      if (data.started.jellyfin || data.started.plex) toast.success("Sync started");
      else toast.info("Sync already running");
    },
    onError: () => toast.error("Failed to start sync"),
  });

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-5 py-3.5 bg-gradient-to-r",
        source === "jellyfin"
          ? "from-[#a95ce0]/15 via-[#4bb8e8]/10 to-transparent"
          : "from-[#e5a00d]/15 via-[#e5a00d]/5 to-transparent",
      )}>
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-5 w-5 shrink-0"
            style={source === "jellyfin"
              ? { background: "linear-gradient(135deg, #a95ce0, #4bb8e8)", mask: "url(/jellyfin-logo.svg) center/contain no-repeat", WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat" }
              : { background: "#e5a00d", mask: "url(/plex-logo.svg) center/contain no-repeat", WebkitMask: "url(/plex-logo.svg) center/contain no-repeat" }
            }
          />
          <p className="text-base font-semibold text-foreground">{server}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onSyncLibraries}
          disabled={isSyncingLibraries}
        >
          {isSyncingLibraries ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          {isSyncingLibraries ? "Scanning..." : "Scan libraries"}
        </Button>
      </div>

      {/* Synced Items */}
      <div className="border-t border-border/30">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowSyncedItems((p) => !p)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSyncedItems((p) => !p); } }}
          className="flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/20"
        >
          <div>
            <p className="text-sm font-medium text-foreground">Synced items</p>
            <p className="text-xs text-muted-foreground">Runs every 5 minutes</p>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => importMedia.mutate()}
              disabled={importMedia.isPending}
            >
              {importMedia.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Sync now
            </Button>
            <ChevronRight size={16} className={cn("text-muted-foreground/50 transition-transform duration-200", showSyncedItems && "rotate-90")} />
          </div>
        </div>

        <AnimatedCollapse open={showSyncedItems}>
          <div className="px-5 pb-5">
            <SyncedItemsTable source={source} />
          </div>
        </AnimatedCollapse>
      </div>
    </div>
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
          {/* Toggle row */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <FolderSearch className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Scan library folders for existing media</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Periodically scan your download folder library paths and match existing files to TMDB.
                  Detected media will be marked as in your library.
                </p>
              </div>
            </div>
            <Switch
              checked={folderScanEnabled}
              onCheckedChange={(checked) => setSetting.mutate({ key: "sync.folderScan.enabled", value: checked })}
              disabled={setSetting.isPending}
            />
          </div>

          {/* Scan now action */}
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
      toast.success(`Synced ${data.length} Jellyfin libraries`);
    },
    onError: () => toast.error("Failed to sync Jellyfin libraries"),
  });
  const syncPlex = trpc.plex.syncLibraries.useMutation({
    onSuccess: (data) => {
      void utils.folder.listWithLinks.invalidate();
      toast.success(`Synced ${data.length} Plex libraries`);
    },
    onError: () => toast.error("Failed to sync Plex libraries"),
  });

  const showJellyfin = (!serverType || serverType === "jellyfin") && jellyfinEnabled;
  const showPlex = (!serverType || serverType === "plex") && plexEnabled;
  const hasMediaServer = showJellyfin || showPlex;

  return (
    <>
      {hasMediaServer && (
        <SettingsSection
          title="Media Server Sync"
          description={`Import existing content from ${serverType === "jellyfin" ? "Jellyfin" : serverType === "plex" ? "Plex" : "Jellyfin or Plex"} into your Canto library.`}
        >
          <div className="space-y-4">
            {showJellyfin && (
              <ServerLibraryGroup
                server="Jellyfin"
                source="jellyfin"
                enabled={jellyfinEnabled}
                isSyncingLibraries={syncJellyfin.isPending}
                onSyncLibraries={() => syncJellyfin.mutate()}
              />
            )}
            {showPlex && (
              <ServerLibraryGroup
                server="Plex"
                source="plex"
                enabled={plexEnabled}
                isSyncingLibraries={syncPlex.isPending}
                onSyncLibraries={() => syncPlex.mutate()}
              />
            )}
          </div>
        </SettingsSection>
      )}
      {!serverType && <FolderScanSection />}
    </>
  );
}
