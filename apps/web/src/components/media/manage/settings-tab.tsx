"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { Separator } from "@canto/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Switch } from "@canto/ui/switch";
import { FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";

interface SettingsTabProps {
  mediaId: string;
  mediaType: "movie" | "show";
  mediaTitle: string;
  currentLibraryId: string | null;
  continuousDownload: boolean;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}

export function SettingsTab({
  mediaId,
  mediaType,
  mediaTitle,
  currentLibraryId,
  continuousDownload,
  drawerOpen,
  onCloseDrawer,
}: SettingsTabProps): React.JSX.Element {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: libraries } = trpc.folder.list.useQuery(undefined, {
    staleTime: Infinity,
    enabled: drawerOpen,
  });

  const { data: mediaTorrents } = trpc.torrent.listByMedia.useQuery(
    { mediaId },
    { enabled: drawerOpen },
  );

  const invalidateAll = (): void => {
    void utils.media.getById.invalidate({ id: mediaId });
    void utils.media.getByExternal.invalidate();
    void utils.library.list.invalidate();
    void utils.torrent.listByMedia.invalidate({ mediaId });
    void utils.torrent.listLiveByMedia.invalidate({ mediaId });
  };

  const setMediaLibrary = trpc.library.setMediaLibrary.useMutation({
    onSuccess: () => {
      void utils.media.getById.invalidate({ id: mediaId });
      void utils.media.getByExternal.invalidate();
      toast.success("Library updated");
    },
    onError: (error) => {
      toast.error(`Failed to update library: ${error.message}`);
    },
  });

  const setContinuousDownload = trpc.library.setContinuousDownload.useMutation({
    onSuccess: () => {
      void utils.media.getById.invalidate({ id: mediaId });
      void utils.media.getByExternal.invalidate();
      toast.success("Continuous download updated");
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const refreshMeta = trpc.media.updateMetadata.useMutation({
    onSuccess: () => {
      void utils.media.getById.invalidate({ id: mediaId });
      void utils.media.getByExternal.invalidate();
      toast.success("Metadata refreshed");
    },
    onError: (error) => {
      toast.error(`Failed to refresh metadata: ${error.message}`);
    },
  });

  const deleteTorrentMutation = trpc.torrent.delete.useMutation({
    onError: (error) => {
      toast.error(`Failed to delete torrent: ${error.message}`);
    },
  });

  const removeFromLibrary = trpc.media.removeFromLibrary.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success(`Removed "${mediaTitle}" from server`);
      setRemoveDialogOpen(false);
      onCloseDrawer();
    },
    onError: (error: { message: string }) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success(`Deleted "${mediaTitle}"`);
      setDeleteDialogOpen(false);
      onCloseDrawer();
      router.push("/");
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const handleRemoveFromLibrary = async (
    values: Record<string, boolean>,
  ): Promise<void> => {
    if (mediaTorrents && mediaTorrents.length > 0) {
      for (const torrent of mediaTorrents) {
        await deleteTorrentMutation.mutateAsync({
          id: torrent.id,
          deleteFiles: values.deleteFiles ?? false,
          removeTorrent: values.removeTorrent ?? false,
        });
      }
    }
    removeFromLibrary.mutate({ id: mediaId });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Library assignment */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Library</h3>
        <Select
          value={currentLibraryId ?? "none"}
          onValueChange={(val) => {
            setMediaLibrary.mutate({
              mediaId,
              libraryId: val === "none" ? null : val,
            });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select library" />
          </SelectTrigger>
          <SelectContent className="z-[70]">
            <SelectItem value="none">No library</SelectItem>
            {libraries?.map((lib) => (
              <SelectItem key={lib.id} value={lib.id}>
                {lib.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Continuous download (shows only) */}
      {mediaType === "show" && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-download new episodes</p>
            <p className="text-xs text-muted-foreground">
              Automatically search and download new episodes
            </p>
          </div>
          <Switch
            checked={continuousDownload}
            onCheckedChange={(checked) =>
              setContinuousDownload.mutate({ mediaId, enabled: checked })
            }
          />
        </div>
      )}

      {/* Refresh metadata */}
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => refreshMeta.mutate({ id: mediaId })}
        disabled={refreshMeta.isPending}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh Metadata
      </Button>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-red-400">Danger Zone</h3>

        <Button
          variant="outline"
          className="w-full gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
          onClick={() => setRemoveDialogOpen(true)}
        >
          <FolderOpen className="h-4 w-4" />
          Remove from Library
        </Button>

        <Button
          variant="outline"
          className="w-full gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete Media
        </Button>
      </div>

      {/* Remove from library confirmation dialog */}
      <ConfirmationDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title="Remove from Library"
        description={mediaTitle}
        checkboxes={[
          {
            id: "deleteFiles",
            label: "Delete files from disk",
            description: "Remove downloaded files permanently.",
          },
          {
            id: "removeTorrent",
            label: "Remove from download client",
            description:
              "Remove from qBittorrent. Stops seeding and frees the slot.",
            defaultChecked: true,
          },
        ]}
        onConfirm={(values) => void handleRemoveFromLibrary(values)}
        confirmLabel={
          removeFromLibrary.isPending || deleteTorrentMutation.isPending
            ? "Removing..."
            : "Remove"
        }
        variant="danger"
        loading={
          removeFromLibrary.isPending || deleteTorrentMutation.isPending
        }
        className="z-[60]"
      />

      {/* Delete media confirmation dialog */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Media"
        description={mediaTitle}
        body={
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete{" "}
            <span className="font-medium text-foreground">{mediaTitle}</span>?
            This will remove all metadata, seasons, episodes, and associated
            files. This action cannot be undone.
          </p>
        }
        onConfirm={() => deleteMutation.mutate({ id: mediaId })}
        confirmLabel={
          deleteMutation.isPending ? "Deleting..." : "Delete Permanently"
        }
        variant="danger"
        loading={deleteMutation.isPending}
        className="z-[60]"
      />
    </div>
  );
}
