"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Switch } from "@canto/ui/switch";
import { Input } from "@canto/ui/input";
import {
  Monitor,
  Sun,
  Moon,
  Save,
  Check,
  Loader2,
  Folder,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  SkipForward,
  HardDrive,
  FolderDown,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { TabBar } from "~/components/layout/tab-bar";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { StateMessage } from "~/components/layout/state-message";
import { SettingsSection } from "~/components/settings/shared";
import { ServicesSection, MetadataSettingsSection } from "~/components/settings/services-section";
import { SearchSection } from "~/components/settings/search-section";
import { AboutSection } from "~/components/settings/about-section";

const themeOptions = [
  { value: "light", label: "Light", description: "Clean and bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: Monitor },
] as const;

const ALL_NAV_ITEMS = [
  { key: "account", label: "Account", adminOnly: false },
  { key: "services", label: "Services", adminOnly: true },
  { key: "metadata", label: "Metadata", adminOnly: true },
  { key: "search", label: "Search", adminOnly: true },
  { key: "libraries", label: "Libraries", adminOnly: true },
  { key: "about", label: "About", adminOnly: false },
] as const;

type NavKey = (typeof ALL_NAV_ITEMS)[number]["key"];

/* -------------------------------------------------------------------------- */
/*  Animated collapse                                                          */
/* -------------------------------------------------------------------------- */

function AnimatedCollapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
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
/*  Page sections                                                              */
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

function ServerLibraryGroup({
  server,
  source,
  enabled,
  libraries,
  isSyncingLibraries,
  onSyncLibraries,
  onToggle,
  onToggleSync,
}: {
  server: string;
  source: "jellyfin" | "plex";
  enabled: boolean;
  libraries: Array<{ id: string; name: string; mediaPath: string | null; enabled: boolean; syncEnabled: boolean }>;
  isSyncingLibraries: boolean;
  onSyncLibraries: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onToggleSync: (id: string, syncEnabled: boolean) => void;
}): React.JSX.Element | null {
  const [showSyncedItems, setShowSyncedItems] = useState(false);
  const importMedia = trpc.sync.importMedia.useMutation({
    onSuccess: (data) => {
      if (data.started.jellyfin || data.started.plex) toast.success("Sync started");
      else toast.info("Sync already running");
    },
    onError: () => toast.error("Failed to start sync"),
  });

  const globalAutoSync = libraries.some((l) => l.syncEnabled);

  const handleGlobalAutoSync = (checked: boolean): void => {
    for (const lib of libraries) {
      if (lib.enabled && lib.syncEnabled !== checked) {
        onToggleSync(lib.id, checked);
      }
    }
  };

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

      {/* Folder cards */}
      {libraries.length > 0 ? (
        <div className="px-5 py-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Select folders to use as download directories</p>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" style={{ scrollbarWidth: "none" }}>
            {libraries.map((lib) => (
              <button
                key={lib.id}
                type="button"
                onClick={() => onToggle(lib.id, !lib.enabled)}
                className={cn(
                  "flex w-36 shrink-0 flex-col items-center gap-2 rounded-xl border p-4 transition-all select-none",
                  lib.enabled
                    ? "border-primary/50 bg-primary/5"
                    : "border-transparent bg-muted/40 hover:bg-muted/60",
                )}
              >
                <Folder className={cn("h-8 w-8", lib.enabled ? "text-primary" : "text-muted-foreground/30")} />
                <span className={cn("text-sm font-medium text-center leading-tight", lib.enabled ? "text-foreground" : "text-muted-foreground/60")}>
                  {lib.name}
                </span>
                {lib.mediaPath && (
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground/40">
                    {lib.mediaPath.split("/").pop()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-5">
          {isSyncingLibraries ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Scanning libraries...</p>
          ) : (
            <StateMessage
              preset="emptyServerLibrary"
              minHeight="120px"
            />
          )}
        </div>
      )}

      {/* Auto sync toggle */}
      {libraries.length > 0 && (
        <div className="flex items-center justify-between border-t border-border/30 px-5 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Automatic sync</p>
            <p className="text-xs text-muted-foreground">Periodically import media from {server}</p>
          </div>
          <Switch
            checked={globalAutoSync}
            onCheckedChange={handleGlobalAutoSync}
          />
        </div>
      )}

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
/*  Libraries section (unified: paths + media servers + downloads)              */
/* -------------------------------------------------------------------------- */

function LibrariesSection(): React.JSX.Element {
  const utils = trpc.useUtils();

  // Root data path
  const rootPathQuery = trpc.library.getRootPath.useQuery();
  const [rootPath, setRootPath] = useState("");
  const [rootDirty, setRootDirty] = useState(false);

  useEffect(() => {
    if (rootPathQuery.data && !rootDirty) setRootPath(rootPathQuery.data);
  }, [rootPathQuery.data, rootDirty]);

  const setRootPathMutation = trpc.library.setRootPath.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated paths for ${data.updated} libraries`);
      setRootDirty(false);
      void utils.library.listLibraries.invalidate();
      void utils.library.getRootPath.invalidate();
    },
    onError: () => toast.error("Failed to update root path"),
  });

  // Libraries for per-library paths
  const { data: libraries, isLoading } = trpc.library.listLibraries.useQuery();

  const updatePaths = trpc.library.updatePaths.useMutation({
    onSuccess: () => {
      toast.success("Paths updated");
      void utils.library.listLibraries.invalidate();
    },
    onError: () => toast.error("Failed to update paths"),
  });

  // Test paths
  const testPaths = trpc.library.testPaths.useMutation({
    onSuccess: (results) => {
      const allOk = results.every((r) => r.downloadPath.ok && r.libraryPath.ok);
      if (allOk) toast.success("All paths are accessible and writable");
      else {
        const issues = results
          .flatMap((r) => [
            !r.downloadPath.ok ? `${r.name} download: ${r.downloadPath.error}` : null,
            !r.libraryPath.ok ? `${r.name} library: ${r.libraryPath.error}` : null,
          ])
          .filter(Boolean);
        toast.error(`Path issues: ${issues.join("; ")}`);
      }
    },
    onError: () => toast.error("Failed to test paths"),
  });

  // Download settings
  const dlSettingsQuery = trpc.library.getDownloadSettings.useQuery();
  const [importMethod, setImportMethod] = useState<"local" | "remote">("local");
  const [seedRatio, setSeedRatio] = useState<string>("");
  const [seedTime, setSeedTime] = useState<string>("");
  const [seedCleanup, setSeedCleanup] = useState(false);
  const [seedDirty, setSeedDirty] = useState(false);

  useEffect(() => {
    if (dlSettingsQuery.data && !seedDirty) {
      setImportMethod(dlSettingsQuery.data.importMethod);
      setSeedRatio(dlSettingsQuery.data.seedRatioLimit?.toString() ?? "");
      setSeedTime(dlSettingsQuery.data.seedTimeLimitHours?.toString() ?? "");
      setSeedCleanup(dlSettingsQuery.data.seedCleanupFiles);
    }
  }, [dlSettingsQuery.data, seedDirty]);

  const setDlSettings = trpc.library.setDownloadSettings.useMutation({
    onSuccess: () => {
      toast.success("Download settings saved");
      setSeedDirty(false);
      void utils.library.getDownloadSettings.invalidate();
    },
    onError: () => toast.error("Failed to save download settings"),
  });

  // Migration
  const migrateMutation = trpc.library.migrateToNewStructure.useMutation({
    onSuccess: (data) => {
      toast.success(`Migration complete: ${data.migrated} migrated, ${data.skipped} skipped, ${data.errors.length} errors`);
      void utils.library.listLibraries.invalidate();
    },
    onError: () => toast.error("Migration failed"),
  });

  // Check if any library uses legacy paths (no downloadPath set)
  const hasLegacyPaths = (libraries ?? []).some((l) => !l.downloadPath);

  // Expanded library
  const [expandedLib, setExpandedLib] = useState<string | null>(null);

  // Media servers
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const jellyfinEnabled = enabledServices?.jellyfin === true;
  const plexEnabled = enabledServices?.plex === true;

  const toggleLibrary = trpc.jellyfin.toggleLibrary.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const toggleSync = trpc.library.toggleSync.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation({
    onSuccess: (data) => {
      void utils.library.listLibraries.invalidate();
      toast.success(`Synced ${data.length} Jellyfin libraries`);
    },
    onError: () => toast.error("Failed to sync Jellyfin libraries"),
  });
  const syncPlex = trpc.plex.syncLibraries.useMutation({
    onSuccess: (data) => {
      void utils.library.listLibraries.invalidate();
      toast.success(`Synced ${data.length} Plex libraries`);
    },
    onError: () => toast.error("Failed to sync Plex libraries"),
  });
  const { data: preferences } = trpc.library.getPreferences.useQuery(undefined, { retry: false });
  const setPreference = trpc.library.setPreference.useMutation({
    onSuccess: () => { void utils.library.getPreferences.invalidate(); },
  });
  const autoMergeVersions = (preferences as Record<string, unknown> | undefined)?.autoMergeVersions ?? true;

  const jellyfinLibs = (libraries ?? []).filter((l) => l.jellyfinLibraryId);
  const plexLibs = (libraries ?? []).filter((l) => l.plexLibraryId);

  // Auto-discover libraries when a server is enabled but has no libraries yet
  const autoDiscoveredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading || !libraries) return;
    if (jellyfinEnabled && jellyfinLibs.length === 0 && !syncJellyfin.isPending && !autoDiscoveredRef.current.has("jellyfin")) {
      autoDiscoveredRef.current.add("jellyfin");
      syncJellyfin.mutate();
    }
    if (plexEnabled && plexLibs.length === 0 && !syncPlex.isPending && !autoDiscoveredRef.current.has("plex")) {
      autoDiscoveredRef.current.add("plex");
      syncPlex.mutate();
    }
  }, [isLoading, libraries, jellyfinEnabled, plexEnabled, jellyfinLibs.length, plexLibs.length, syncJellyfin, syncPlex]);

  const allLibs = libraries ?? [];
  const missingPaths = allLibs.some((l) => !l.libraryPath);

  return (
    <div>
      {/* ── Step 1: Your Libraries ─────────────────────────────────────── */}

      <SettingsSection
        title="Your Libraries"
        description="Each library maps a media type to two folders: where your torrent client downloads files, and where your organized media lives."
      >
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : allLibs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {jellyfinEnabled || plexEnabled
                  ? "Scanning your media server for libraries..."
                  : "Connect a media server in Services, or seed default libraries to get started."}
              </p>
            </div>
          ) : (
            <>
              {missingPaths && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Some libraries are missing paths. Downloads won't import until you configure at least the <strong>library path</strong> for each one.
                  </p>
                </div>
              )}

              {allLibs.map((lib) => {
                const server = lib.jellyfinLibraryId ? "Jellyfin" : lib.plexLibraryId ? "Plex" : null;
                return (
                  <LibraryCard
                    key={lib.id}
                    lib={lib}
                    server={server}
                    expanded={expandedLib === lib.id}
                    onToggle={() => setExpandedLib(expandedLib === lib.id ? null : lib.id)}
                    onSavePaths={(dl, lp) => updatePaths.mutate({ id: lib.id, downloadPath: dl, libraryPath: lp })}
                    onToggleSync={(syncEnabled) => toggleSync.mutate({ id: lib.id, syncEnabled })}
                    isSaving={updatePaths.isPending}
                  />
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => testPaths.mutate()}
                disabled={testPaths.isPending}
              >
                {testPaths.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                Test all paths
              </Button>
            </>
          )}

          {/* Quick fill shortcut */}
          {allLibs.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/10 px-4 py-3">
              <div className="relative flex-1">
                <Input
                  value={rootPath}
                  onChange={(e) => { setRootPath(e.target.value); setRootDirty(true); }}
                  placeholder="Root path (e.g. /data)"
                  className="h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs shrink-0"
                onClick={() => setRootPathMutation.mutate({ path: rootPath })}
                disabled={setRootPathMutation.isPending || !rootDirty}
              >
                {setRootPathMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Fill all paths
              </Button>
              <p className="text-[10px] text-muted-foreground/60 shrink-0 hidden lg:block">
                Sets /torrents and /media subdirs
              </p>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ── Step 2: Import & Seeding ───────────────────────────────────── */}

      <SettingsSection
        title="Import & Seeding"
        description="How completed downloads get organized into your library, and when to stop seeding."
      >
        <div className="space-y-4">
          {/* Import method */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Import method</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setImportMethod("local"); setSeedDirty(true); }}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                  importMethod === "local"
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/40 bg-muted/20 hover:bg-muted/40",
                )}
              >
                <span className="text-sm font-medium">Local (hardlinks)</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Canto and torrent client on the same machine. Zero-cost imports, seeding preserved.
                </p>
              </button>
              <button
                type="button"
                onClick={() => { setImportMethod("remote"); setSeedDirty(true); }}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                  importMethod === "remote"
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/40 bg-muted/20 hover:bg-muted/40",
                )}
              >
                <span className="text-sm font-medium">Remote (API)</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Canto on a different machine. Files moved via torrent client API. Seeding stops after import.
                </p>
              </button>
            </div>
          </div>

          {/* Seed limits */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Seed limits</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={seedRatio}
                  onChange={(e) => { setSeedRatio(e.target.value); setSeedDirty(true); }}
                  placeholder="No ratio limit"
                  className="h-9 text-sm"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Upload ratio before stopping</p>
              </div>
              <div>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={seedTime}
                  onChange={(e) => { setSeedTime(e.target.value); setSeedDirty(true); }}
                  placeholder="No time limit"
                  className="h-9 text-sm"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Hours before stopping</p>
              </div>
            </div>
          </div>

          {/* Cleanup toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Clean up after seeding</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Delete torrent files after seed limits are met. Safe with hardlinks — library copies stay.
              </p>
            </div>
            <Switch checked={seedCleanup} onCheckedChange={(v) => { setSeedCleanup(v); setSeedDirty(true); }} />
          </div>

          {seedDirty && (
            <Button
              size="sm"
              onClick={() => setDlSettings.mutate({
                importMethod,
                seedRatioLimit: seedRatio ? parseFloat(seedRatio) : null,
                seedTimeLimitHours: seedTime ? parseFloat(seedTime) : null,
                seedCleanupFiles: seedCleanup,
              })}
              disabled={setDlSettings.isPending}
            >
              {setDlSettings.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
          )}
        </div>
      </SettingsSection>

      {/* ── Step 3: Media Server Sync ──────────────────────────────────── */}

      {(jellyfinEnabled || plexEnabled) && (
        <SettingsSection
          title="Media Server Sync"
          description="Import existing content from Jellyfin or Plex into your Canto library."
        >
          <div className="space-y-4">
            <ServerLibraryGroup
              server="Jellyfin"
              source="jellyfin"
              enabled={jellyfinEnabled}
              libraries={jellyfinLibs}
              isSyncingLibraries={syncJellyfin.isPending}
              onSyncLibraries={() => syncJellyfin.mutate()}
              onToggle={(id, enabled) => toggleLibrary.mutate({ id, enabled })}
              onToggleSync={(id, syncEnabled) => toggleSync.mutate({ id, syncEnabled })}
            />
            <ServerLibraryGroup
              server="Plex"
              source="plex"
              enabled={plexEnabled}
              libraries={plexLibs}
              isSyncingLibraries={syncPlex.isPending}
              onSyncLibraries={() => syncPlex.mutate()}
              onToggle={(id, enabled) => toggleLibrary.mutate({ id, enabled })}
              onToggleSync={(id, syncEnabled) => toggleSync.mutate({ id, syncEnabled })}
            />
          </div>
        </SettingsSection>
      )}

      {/* ── Post-import ────────────────────────────────────────────────── */}

      <SettingsSection title="Post-import" description="Automatic actions after media files are imported.">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-merge versions</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
              When you download a second quality version, Jellyfin will automatically merge them.
            </p>
          </div>
          <Switch checked={autoMergeVersions === true} onCheckedChange={(checked) => setPreference.mutate({ key: "autoMergeVersions", value: checked })} />
        </div>
      </SettingsSection>

      {/* ── Migration (only if legacy paths detected) ──────────────────── */}

      {hasLegacyPaths && (
        <SettingsSection title="Migration" description="Move existing files to the new folder structure.">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <p className="text-sm font-medium text-foreground">Legacy paths detected</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Some libraries use the old path layout. Migrate to reorganize your existing files.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => migrateMutation.mutate({ rootPath })}
              disabled={migrateMutation.isPending}
            >
              {migrateMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {migrateMutation.isPending ? "Migrating..." : "Migrate to new structure"}
            </Button>
          </div>
        </SettingsSection>
      )}
    </div>
  );
}

function LibraryCard({
  lib,
  server,
  expanded,
  onToggle,
  onSavePaths,
  onToggleSync,
  isSaving,
}: {
  lib: { id: string; name: string; type: string; downloadPath: string | null; libraryPath: string | null; qbitCategory: string | null; syncEnabled: boolean };
  server: "Jellyfin" | "Plex" | null;
  expanded: boolean;
  onToggle: () => void;
  onSavePaths: (downloadPath: string, libraryPath: string) => void;
  onToggleSync: (syncEnabled: boolean) => void;
  isSaving: boolean;
}): React.JSX.Element {
  const [dlPath, setDlPath] = useState(lib.downloadPath ?? "");
  const [libPath, setLibPath] = useState(lib.libraryPath ?? "");
  const dirty = dlPath !== (lib.downloadPath ?? "") || libPath !== (lib.libraryPath ?? "");
  const configured = !!lib.libraryPath;

  useEffect(() => {
    setDlPath(lib.downloadPath ?? "");
    setLibPath(lib.libraryPath ?? "");
  }, [lib.downloadPath, lib.libraryPath]);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-colors",
      !configured ? "border-amber-500/30" : "border-border/40",
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/20"
      >
        <div className="flex items-center gap-3">
          <Folder className={cn("h-5 w-5", configured ? "text-primary" : "text-amber-500/60")} />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{lib.name}</p>
              {server && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  server === "Jellyfin" ? "bg-purple-500/10 text-purple-400" : "bg-amber-500/10 text-amber-400",
                )}>
                  {server}
                </span>
              )}
              {!configured && (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-400">
                  Not configured
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60 truncate max-w-xs">
              {lib.libraryPath ?? "No library path set"}
            </p>
          </div>
        </div>
        <ChevronDown size={16} className={cn("text-muted-foreground/50 transition-transform duration-200", expanded && "rotate-180")} />
      </button>

      <AnimatedCollapse open={expanded}>
        <div className="space-y-3 border-t border-border/30 px-4 py-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              Library path
              <span className="text-muted-foreground/40">— where your organized media lives{server ? ` (auto-filled from ${server})` : ""}</span>
            </label>
            <Input
              value={libPath}
              onChange={(e) => setLibPath(e.target.value)}
              placeholder={server ? "Auto-detected from media server" : "/mnt/media/movies"}
              className="text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FolderDown className="h-3.5 w-3.5" />
              Download path
              <span className="text-muted-foreground/40">— where the torrent client saves files</span>
            </label>
            <Input
              value={dlPath}
              onChange={(e) => setDlPath(e.target.value)}
              placeholder="/mnt/torrents/movies"
              className="text-sm"
            />
          </div>

          {server && (
            <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/10 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium text-foreground">Sync from {server}</p>
                <p className="text-[10px] text-muted-foreground">Periodically import existing media from your server</p>
              </div>
              <Switch
                checked={lib.syncEnabled}
                onCheckedChange={(checked) => onToggleSync(checked)}
              />
            </div>
          )}

          {dirty && (
            <Button
              size="sm"
              onClick={() => onSavePaths(dlPath, libPath)}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

function AccountSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  const handleSaveProfile = async (): Promise<void> => {
    setProfileSaving(true);
    try {
      await authClient.updateUser({ name, image: user?.image });
      if (email !== user?.email) {
        await authClient.changeEmail({ newEmail: email });
      }
      setProfileDirty(false);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (): Promise<void> => {
    if (!currentPassword || !newPassword) return;
    setPasswordSaving(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div>
      <SettingsSection title="Profile" description="Update your account information.">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="settings-name" className="text-sm font-medium text-muted-foreground">Name</label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setProfileDirty(true); }}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-email" className="text-sm font-medium text-muted-foreground">Email</label>
              <Input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setProfileDirty(true); }}
                className="h-10"
              />
            </div>
          </div>

          {profileDirty && (
            <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Password" description="Change your account password.">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="settings-current-password" className="text-sm font-medium text-muted-foreground">Current password</label>
            <Input
              id="settings-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="settings-new-password" className="text-sm font-medium text-muted-foreground">New password</label>
            <Input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="h-10"
            />
          </div>
          <Button size="sm" onClick={handleChangePassword} disabled={passwordSaving || !currentPassword || !newPassword}>
            {passwordSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Change password
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Appearance" description="Choose a theme for the interface.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, description: desc, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-xl border p-4 transition-all",
                mounted && theme === value
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                  : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <div className="text-center">
                <span className="block text-xs font-medium">{label}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{desc}</span>
              </div>
            </button>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function SettingsPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const tabParam = searchParams.get("tab") as NavKey | null;
  const activeNav = tabParam && NAV_ITEMS.some((i) => i.key === tabParam) ? tabParam : "account";

  const setActiveNav = useCallback((key: string) => {
    router.replace(`/settings?tab=${key}`, { scroll: false });
  }, [router]);

  useEffect(() => { document.title = "Settings — Canto"; }, []);

  return (
    <div className="w-full">
      <PageHeader title="Settings" subtitle="Manage your account settings and preferences" />

      <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={NAV_ITEMS.map((item) => ({ value: item.key, label: item.label }))}
          value={activeNav}
          onChange={setActiveNav}
        />
        {activeNav === "account" && <AccountSection />}
        {activeNav === "services" && <ServicesSection />}
        {activeNav === "metadata" && <MetadataSettingsSection />}
        {activeNav === "search" && <SearchSection />}
        {activeNav === "libraries" && <LibrariesSection />}
        {activeNav === "about" && <AboutSection />}
      </div>
    </div>
  );
}
