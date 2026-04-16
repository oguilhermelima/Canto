"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { HardDrive, RefreshCw } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { SettingsRow } from "./settings-row";
import { ProviderOverrideDialog } from "./provider-override-dialog";
import type { useManageModal } from "./use-manage-modal";

type ManageData = ReturnType<typeof useManageModal>;

interface PreferencesTabProps {
  media: NonNullable<ManageData["media"]>;
  mediaId: string;
  mediaType: "movie" | "show";
  libraries: ManageData["libraries"];
  setMediaLibrary: ManageData["setMediaLibrary"];
  setContinuousDownload: ManageData["setContinuousDownload"];
  refreshMeta: ManageData["refreshMeta"];
  invalidateMedia: ManageData["invalidateMedia"];
}

export function PreferencesTab({
  media,
  mediaId,
  mediaType,
  libraries,
  setMediaLibrary,
  setContinuousDownload,
  refreshMeta,
  invalidateMedia,
}: PreferencesTabProps): React.JSX.Element {
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<"tmdb" | "tvdb" | null>(null);
  const { data: resolvedFolder } = trpc.folder.resolve.useQuery({ mediaId });
  const selectTriggerCn =
    "h-10 rounded-xl border-none bg-accent text-sm ring-0 focus-visible:ring-1 focus-visible:ring-primary/30";
  const autoLibraryLabel = resolvedFolder?.folderName
    ? `Auto (${resolvedFolder.folderName})`
    : "Auto";

  return (
    <div className="space-y-6">
      <SettingsRow
        label="Library"
        description="Where this title will be saved when downloading"
      >
        <div className="flex w-full items-center gap-2 rounded-xl bg-accent p-1.5 sm:w-auto">
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            <span className="font-medium">Saving to</span>
          </div>
          <Select
            value={media.libraryId ?? "default"}
            onValueChange={(v) =>
              setMediaLibrary.mutate({
                mediaId,
                libraryId: v === "default" ? null : v,
              })
            }
          >
            <SelectTrigger className={cn(selectTriggerCn, "h-9 w-full sm:w-[220px]")}>
              <SelectValue placeholder={autoLibraryLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{autoLibraryLabel}</SelectItem>
              {libraries?.map((lib) => (
                <SelectItem key={lib.id} value={lib.id}>
                  {lib.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsRow>
      {mediaType === "show" && (
        <SettingsRow
          label="Auto-download new episodes"
          description="Automatically search and download new episodes as they air"
        >
          <Switch
            checked={media.continuousDownload}
            onCheckedChange={(c) =>
              setContinuousDownload.mutate({ mediaId, enabled: c })
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
          onClick={() => refreshMeta.mutate({ id: mediaId })}
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
          label="Season/episode provider"
          description="Choose which provider determines season and episode structure"
        >
          <Select
            value={media.overrideProviderFor ?? "default"}
            onValueChange={(v) => {
              const value = v === "default" ? null : (v as "tmdb" | "tvdb");
              setPendingOverride(value);
              setOverrideDialogOpen(true);
            }}
          >
            <SelectTrigger className={cn(selectTriggerCn, "w-full sm:w-[220px]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Follow global setting</SelectItem>
              <SelectItem value="tmdb">TMDB</SelectItem>
              <SelectItem value="tvdb">TVDB</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      )}

      <ProviderOverrideDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        mediaId={mediaId}
        targetProvider={pendingOverride}
        onSuccess={invalidateMedia}
      />
    </div>
  );
}
