"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import { Skeleton } from "@canto/ui/skeleton";
import { Badge } from "@canto/ui/badge";
import {
  Loader2,
  RefreshCw,
  FolderSearch,
  Film,
  Tv,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "@canto/ui/state-message";
import { SettingField } from "~/components/settings/_primitives";
import { SettingsSection } from "~/components/settings/shared";
import { SyncItemsDialog } from "~/components/settings/sync-items-dialog";

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

function SyncStatusSection(): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const multipleServers =
    [enabledServices?.jellyfin, enabledServices?.plex].filter(Boolean).length > 1;

  const importMedia = trpc.sync.importMedia.useMutation({
    onSuccess: (data) => {
      if (data.started.jellyfin || data.started.plex) toast.success("Sync started");
      else toast.info("Sync already running");
    },
    onError: () => toast.error("Failed to start sync"),
  });

  return (
    <SettingsSection
      title="Sync"
      description="Review and correct media matched from your server. Edit any item to fix incorrect matches."
    >
      <div className="space-y-3">
        {/* Trigger sync card */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Trigger sync</p>
            <p className="text-xs text-muted-foreground">
              Trigger a sync now instead of waiting for the automatic schedule
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => importMedia.mutate()}
            disabled={importMedia.isPending}
          >
            {importMedia.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Sync
          </Button>
        </div>

        {/* Library items viewer */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Library items</p>
            <p className="text-xs text-muted-foreground">
              Inspect, filter, and fix matches for every item pulled from your servers
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => setDialogOpen(true)}
          >
            <ListChecks className="mr-1.5 h-4 w-4" />
            View library items
          </Button>
        </div>
      </div>

      <SyncItemsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        multipleServers={multipleServers}
      />
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
    <div className="divide-y divide-border/30 rounded-xl border border-border overflow-hidden">
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
                      <p className="text-xs text-muted-foreground truncate">{lib.serverPath}</p>
                    )}
                    <span className="text-xs text-muted-foreground">
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

function _ServerLibraryGroup({
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
  if (!enabled) return null;

  return (
    <SettingsSection
      title={`${source === "jellyfin" ? "Jellyfin" : "Plex"} Libraries`}
      description="Import your existing collection from this server into Canto. Enabled libraries are scanned every 5 minutes."
    >
      <div className="space-y-4">
        {/* Rescan server card */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Scan server libraries</p>
            <p className="text-xs text-muted-foreground">Discover available libraries on the server to enable syncing</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={onSyncLibraries}
            disabled={isSyncingLibraries}
          >
            {isSyncingLibraries ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Scan
          </Button>
        </div>

        <LibraryLinkingSection source={source} />
      </div>
    </SettingsSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Folder Scan section                                                        */
/* -------------------------------------------------------------------------- */

export function FolderScanSection(): React.JSX.Element {
  const { data: allSettings } = trpc.settings.getAll.useQuery();
  const folderScanEnabled = allSettings?.["sync.folderScan.enabled"] === true;

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
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <FolderSearch className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Scan libraries for existing media</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Periodically scan your library storage paths and match existing files to TMDB.
                  Detected media will be added to your library.
                </p>
              </div>
            </div>
            <SettingField settingKey="sync.folderScan.enabled" hideLabel hideHelp />
          </div>

          <div className="flex items-center justify-between border-t border-border px-5 py-3.5">
            <p className="text-xs text-muted-foreground">
              {folderScanEnabled ? "Runs periodically in the background" : "Enable the toggle above for automatic scans"}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-xl"
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

export function MediaServerSyncSection(): React.JSX.Element {
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const jellyfinEnabled = enabledServices?.jellyfin === true;
  const plexEnabled = enabledServices?.plex === true;

  if (!jellyfinEnabled && !plexEnabled) return <></>;
  return <SyncStatusSection />;
}
