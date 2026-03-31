"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { TabBar } from "~/components/layout/tab-bar";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { SettingsSection } from "~/components/settings/shared";
import { ServicesSection, MetadataSettingsSection } from "~/components/settings/services-section";
import { AboutSection } from "~/components/settings/about-section";

const themeOptions = [
  { value: "light", label: "Light", description: "Clean and bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: Monitor },
] as const;

const NAV_ITEMS = [
  { key: "account", label: "Account" },
  { key: "services", label: "Services" },
  { key: "metadata", label: "Metadata" },
  { key: "libraries", label: "Libraries" },
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

function SyncedItemsTable({ source }: { source?: "jellyfin" | "plex" }): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "failed" | "imported" | "skipped">("all");
  const [page, setPage] = useState(1);
  const [fixDialogItem, setFixDialogItem] = useState<{ id: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tmdbIdInput, setTmdbIdInput] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.sync.listSyncedItems.useQuery({
    source,
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
            {searchResults.data && searchResults.data.results.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-border/40">
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
  if (!enabled) return null;

  const [showSyncedItems, setShowSyncedItems] = useState(false);
  const importMedia = trpc.sync.importMedia.useMutation({
    onSuccess: (data) => {
      if (data.started) toast.success("Sync started");
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
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isSyncingLibraries ? "Scanning libraries..." : `No libraries found on ${server}.`}
          </p>
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
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setProfileDirty(true); }}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <Input
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
            <label className="text-sm font-medium text-muted-foreground">Current password</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">New password</label>
            <Input
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
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, description: desc, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition-all",
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
  const [activeNav, setActiveNav] = useState<NavKey>("account");

  useEffect(() => { document.title = "Settings — Canto"; }, []);

  return (
    <div className="w-full">
      <PageHeader title="Settings" subtitle="Manage your account settings and preferences" />

      {/* Sticky nav */}
      <div className="sticky top-14 z-20 bg-background px-4 py-2.5 md:top-16 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={NAV_ITEMS.map((item) => ({ value: item.key, label: item.label }))}
          value={activeNav}
          onChange={(v) => setActiveNav(v as NavKey)}
        />
      </div>

      <div className="px-4 pt-6 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {activeNav === "account" && <AccountSection />}
        {activeNav === "services" && <ServicesSection />}
        {activeNav === "metadata" && <MetadataSettingsSection />}
        {activeNav === "libraries" && <LibrariesSection />}
        {activeNav === "about" && <AboutSection />}
      </div>
    </div>
  );
}
