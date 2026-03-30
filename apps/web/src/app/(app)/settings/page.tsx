"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
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
  Download,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  SkipForward,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDirectSearch } from "~/hooks/use-direct-search";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { SettingsSection } from "~/components/settings/shared";
import { ServicesSection } from "~/components/settings/services-section";
import { AboutSection } from "~/components/settings/about-section";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const themeOptions = [
  { value: "light", label: "Light", description: "Clean and bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: Monitor },
] as const;

const NAV_ITEMS = [
  { key: "services", label: "Services" },
  { key: "libraries", label: "Libraries" },
  { key: "tmdb", label: "TMDB" },
  { key: "preferences", label: "Preferences" },
  { key: "about", label: "About" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

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

interface SyncStatusData {
  status: string;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
}

function SyncedItemsTable(): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "failed" | "imported" | "skipped">("all");
  const [page, setPage] = useState(1);
  const [fixDialogItem, setFixDialogItem] = useState<{ id: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tmdbIdInput, setTmdbIdInput] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.sync.listSyncedItems.useQuery({
    result: filter === "all" ? undefined : filter,
    page,
    pageSize: 20,
  });

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
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
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
        <p className="text-sm text-muted-foreground text-center py-6">No synced items found.</p>
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
                  className="h-10 rounded-lg border-none bg-muted/50 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
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
                className="h-10 rounded-lg border-none bg-muted/50 text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
              />
            </div>

            {/* Search results */}
            {searchResults.data && searchResults.data.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-border/40">
                {searchResults.data.slice(0, 10).map((result) => (
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
  enabled,
  libraries,
  syncStatus,
  isSyncingLibraries,
  isImporting,
  onSyncLibraries,
  onImport,
  onToggle,
  onToggleSync,
  syncProgress,
  isRunningOnServer,
}: {
  server: string;
  enabled: boolean;
  libraries: Array<{ id: string; name: string; mediaPath: string | null; enabled: boolean; syncEnabled: boolean }>;
  syncStatus: SyncStatusData | null;
  isSyncingLibraries: boolean;
  isImporting: boolean;
  syncProgress: number;
  isRunningOnServer: boolean;
  onSyncLibraries: () => void;
  onImport: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onToggleSync: (id: string, syncEnabled: boolean) => void;
}): React.JSX.Element | null {
  if (!enabled) return null;

  const [showSyncedItems, setShowSyncedItems] = useState(false);

  const hasSyncable = libraries.some((l) => l.enabled && l.syncEnabled);
  const isBusy = isSyncingLibraries || isImporting;
  const hasResults = syncStatus && syncStatus.status !== "running" && !isImporting && (syncStatus.imported + syncStatus.skipped + syncStatus.failed) > 0;

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-5 py-3.5">
        <p className="text-base font-semibold text-foreground">{server}</p>
        <div className="flex items-center gap-3">
          {isBusy && (
            <div className="flex items-center gap-2">
              {isRunningOnServer ? (
                <>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${syncProgress}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{syncProgress}%</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Starting...</span>
              )}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={hasSyncable ? onImport : () => onSyncLibraries()}
            disabled={isBusy || (!hasSyncable && libraries.length > 0)}
          >
            {isBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            {isSyncingLibraries ? "Syncing..." : isBusy ? "Importing..." : "Sync media"}
          </Button>
        </div>
      </div>

      {/* Libraries */}
      {libraries.length > 0 ? (
        <div className="divide-y divide-border/30">
          {libraries.map((lib) => (
            <div key={lib.id} className="px-5 py-4">
              <p className="text-base font-semibold text-foreground">{lib.name}</p>
              {lib.mediaPath && (
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Folder className="h-3.5 w-3.5 shrink-0" />{lib.mediaPath}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => onToggle(lib.id, !lib.enabled)}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-all select-none",
                    lib.enabled
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border/40 text-muted-foreground hover:border-border/60",
                  )}
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span>Use for downloads</span>
                </button>
                <button
                  type="button"
                  onClick={() => lib.enabled && onToggleSync(lib.id, !lib.syncEnabled)}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-all select-none",
                    !lib.enabled
                      ? "pointer-events-none border-border/20 text-muted-foreground/40"
                      : lib.syncEnabled
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border/40 text-muted-foreground hover:border-border/60",
                  )}
                >
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  <span>Import existing media</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">No libraries. Click &quot;Sync media&quot; to discover libraries from {server}.</p>
        </div>
      )}

      {/* Synced Items */}
      {hasResults && (
        <div className="border-t border-border/30">
          <button
            type="button"
            onClick={() => setShowSyncedItems((p) => !p)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/20"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Synced items</p>
              <span className="text-xs text-muted-foreground">
                {syncStatus.imported + syncStatus.skipped + syncStatus.failed} items
              </span>
              {syncStatus.failed > 0 && (
                <span className="text-xs text-destructive">{syncStatus.failed} failed</span>
              )}
            </div>
            <ChevronRight size={16} className={cn("text-muted-foreground/50 transition-transform duration-200", showSyncedItems && "rotate-90")} />
          </button>

          <AnimatedCollapse open={showSyncedItems}>
            <div className="px-5 pb-5">
              <SyncedItemsTable />
            </div>
          </AnimatedCollapse>
        </div>
      )}
    </div>
  );
}

function LibrariesSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: libraries, isLoading } = trpc.library.listLibraries.useQuery();
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();

  const jellyfinEnabled = enabledServices?.jellyfin === true;
  const plexEnabled = enabledServices?.plex === true;
  const anyServerEnabled = jellyfinEnabled || plexEnabled;

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

  const [busy, setBusy] = useState(false);
  const busyStarted = useRef(0);
  const importMedia = trpc.sync.importMedia.useMutation();
  const { data: syncStatus } = trpc.sync.importMediaStatus.useQuery(undefined, {
    refetchInterval: busy ? 1500 : false,
  });

  const serverRunning = syncStatus?.status === "running";

  // Clear busy when server is no longer running AND enough time has passed since we triggered
  useEffect(() => {
    if (!busy) return;
    const elapsed = Date.now() - busyStarted.current;
    if (elapsed > 3000 && !serverRunning) {
      setBusy(false);
      void utils.sync.listSyncedItems.invalidate();
    }
  }, [busy, serverRunning, syncStatus, utils.sync.listSyncedItems]);

  const isSyncing = busy || serverRunning;
  const syncProgress = serverRunning && syncStatus && syncStatus.total > 0
    ? Math.round((syncStatus.processed / syncStatus.total) * 100) : 0;
  const hasSyncableLibraries = (libraries ?? []).some((l) => l.enabled && l.syncEnabled);

  const jellyfinLibs = (libraries ?? []).filter((l) => l.jellyfinLibraryId);
  const plexLibs = (libraries ?? []).filter((l) => l.plexLibraryId);

  const triggerImport = (syncLibraryPromise?: Promise<unknown>): void => {
    setBusy(true);
    busyStarted.current = Date.now();

    const doImport = (): void => {
      importMedia.mutate(undefined, {
        onSuccess: (data) => {
          if (!data.started) { toast.error("Import already running"); setBusy(false); }
          // Don't setBusy(false) on success — wait for polling to see it complete
        },
        onError: () => { toast.error("Failed to start import"); setBusy(false); },
      });
    };

    if (syncLibraryPromise) {
      syncLibraryPromise.then(() => doImport()).catch(() => { toast.error("Failed to sync libraries"); setBusy(false); });
    } else {
      doImport();
    }
  };

  return (
    <div>
      <SettingsSection title="Libraries" description="Manage your media libraries. Enable 'Sync' to import existing content from your servers.">
        {!anyServerEnabled ? (
          <div className="rounded-xl border border-dashed border-border/40 px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">Enable a media server in Services to manage libraries.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <ServerLibraryGroup
              server="Jellyfin"
              enabled={jellyfinEnabled}
              libraries={jellyfinLibs}
              syncStatus={syncStatus}
              isSyncingLibraries={syncJellyfin.isPending}
              isImporting={isSyncing}
              syncProgress={syncProgress}
              isRunningOnServer={!!serverRunning}
              onSyncLibraries={() => syncJellyfin.mutate()}
              onImport={() => triggerImport(syncJellyfin.mutateAsync())}
              onToggle={(id, enabled) => toggleLibrary.mutate({ id, enabled })}
              onToggleSync={(id, syncEnabled) => toggleSync.mutate({ id, syncEnabled })}
            />
            <ServerLibraryGroup
              server="Plex"
              enabled={plexEnabled}
              libraries={plexLibs}
              syncStatus={syncStatus}
              isSyncingLibraries={syncPlex.isPending}
              isImporting={isSyncing}
              syncProgress={syncProgress}
              isRunningOnServer={!!serverRunning}
              onSyncLibraries={() => syncPlex.mutate()}
              onImport={() => triggerImport(syncPlex.mutateAsync())}
              onToggle={(id, enabled) => toggleLibrary.mutate({ id, enabled })}
              onToggleSync={(id, syncEnabled) => toggleSync.mutate({ id, syncEnabled })}
            />
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Post-import" description="Automatic actions that run after media files are downloaded and imported.">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-5 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-merge versions</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              When you download a second quality version, Jellyfin will automatically merge them.
            </p>
          </div>
          <Switch checked={autoMergeVersions === true} onCheckedChange={(checked) => setPreference.mutate({ key: "autoMergeVersions", value: checked })} />
        </div>
      </SettingsSection>
    </div>
  );
}

function TmdbSettingsSection(): React.JSX.Element {
  const { enabled: directSearchEnabled, setEnabled: setDirectSearch } = useDirectSearch();
  const { region, setRegion } = useWatchRegion();
  const [saved, setSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const displayRegion = pendingRegion ?? region;

  const { data: regions, isLoading: regionsLoading } = trpc.provider.regions.useQuery();
  const { data: watchProviders, isLoading: providersLoading } =
    trpc.provider.watchProviders.useQuery({ type: "movie", region: displayRegion }, { enabled: !!displayRegion });

  const handleSaveRegion = (): void => {
    setRegion(pendingRegion ?? region);
    setPendingRegion(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const hasPendingChange = pendingRegion !== null && pendingRegion !== region;

  return (
    <div>
      <SettingsSection title="Watch Region" description="Determines which streaming providers appear on media pages.">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {regionsLoading ? <Skeleton className="h-9 w-[240px]" /> : (
              <Select value={displayRegion} onValueChange={(v) => setPendingRegion(v)}>
                <SelectTrigger className="h-9 w-[240px] text-sm"><SelectValue placeholder="Select region..." /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {regions?.sort((a, b) => a.englishName.localeCompare(b.englishName)).map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.englishName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={handleSaveRegion} disabled={!hasPendingChange && !saved}>
              {saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {saved ? "Saved" : "Save"}
            </Button>
          </div>

          {displayRegion && (
            <div>
              <p className="mb-3 text-xs text-muted-foreground">Available streaming services</p>
              {providersLoading ? (
                <div className="flex flex-wrap gap-2.5">
                  {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-11 w-11 rounded-lg" />)}
                </div>
              ) : watchProviders && watchProviders.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  {watchProviders.slice(0, 30).map((p) => (
                    <img key={p.providerId} src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`} alt={p.providerName} title={p.providerName} className="h-11 w-11 rounded-lg border border-border/60 object-cover" />
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">No providers found.</p>}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Direct search on streamings" description="When enabled, clicking a provider on media pages opens a search for the title directly on that streaming service. When disabled, links go to the TMDB watch page instead.">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-5 py-5">
          <p className="text-sm font-medium text-foreground">Enable direct search</p>
          <Switch checked={directSearchEnabled} onCheckedChange={setDirectSearch} />
        </div>
      </SettingsSection>
    </div>
  );
}

function PreferencesSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SettingsSection title="Appearance" description="Choose a theme for the interface.">
      <div className="grid grid-cols-3 gap-3">
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
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function SettingsPage(): React.JSX.Element {
  const [activeNav, setActiveNav] = useState<NavKey>("services");

  useEffect(() => { document.title = "Settings — Canto"; }, []);

  return (
    <div className="w-full">
      <PageHeader title="Settings" subtitle="Manage your account settings and preferences" />

      {/* Sticky tab bar */}
      <div className="sticky top-14 z-20 bg-background px-4 py-2.5 md:top-16 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={NAV_ITEMS.map((item) => ({ value: item.key, label: item.label }))}
          value={activeNav}
          onChange={(v) => setActiveNav(v as NavKey)}
        />
      </div>

      <div className="px-4 pt-6 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {activeNav === "services" && <ServicesSection />}
        {activeNav === "libraries" && <LibrariesSection />}
        {activeNav === "tmdb" && <TmdbSettingsSection />}
        {activeNav === "preferences" && <PreferencesSection />}
        {activeNav === "about" && <AboutSection />}
      </div>
    </div>
  );
}
