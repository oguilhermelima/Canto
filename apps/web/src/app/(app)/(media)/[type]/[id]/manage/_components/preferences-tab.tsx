"use client";

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
import { RefreshCw } from "lucide-react";
import { SettingsRow } from "./settings-row";
import type { useManageMedia } from "./use-manage-media";

type ManageData = ReturnType<typeof useManageMedia>;

interface PreferencesTabProps {
  media: NonNullable<ManageData["media"]>;
  mediaId: string;
  mediaType: "movie" | "show";
  libraries: ManageData["libraries"];
  setMediaLibrary: ManageData["setMediaLibrary"];
  setContinuousDownload: ManageData["setContinuousDownload"];
  refreshMeta: ManageData["refreshMeta"];
  syncTvdb: ManageData["syncTvdb"];
}

export function PreferencesTab({
  media,
  mediaId,
  mediaType,
  libraries,
  setMediaLibrary,
  setContinuousDownload,
  refreshMeta,
  syncTvdb,
}: PreferencesTabProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <SettingsRow
        label="Library"
        description="Where to store downloaded files"
      >
        <Select
          value={media.libraryId ?? "default"}
          onValueChange={(v) =>
            setMediaLibrary.mutate({
              mediaId,
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
          label="Sync TVDB Seasons"
          description="Use TVDB for accurate season splits and absolute episode numbering"
        >
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => syncTvdb.mutate({ id: mediaId })}
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
  );
}
