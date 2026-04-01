"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Separator } from "@canto/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
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
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false);
  const [removeDeleteTorrent, setRemoveDeleteTorrent] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: libraries } = trpc.library.listLibraries.useQuery(undefined, {
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

  const removeFromLibrary = trpc.media.unmarkDownloaded.useMutation({
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

  const handleRemoveFromLibrary = async (): Promise<void> => {
    if (mediaTorrents && mediaTorrents.length > 0) {
      for (const torrent of mediaTorrents) {
        await deleteTorrentMutation.mutateAsync({
          id: torrent.id,
          deleteFiles: removeDeleteFiles,
          removeTorrent: removeDeleteTorrent,
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
      <Dialog
        open={removeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveDeleteFiles(false);
            setRemoveDeleteTorrent(true);
          }
          setRemoveDialogOpen(open);
        }}
      >
        <DialogContent className="z-[60] max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold">
                Remove from Library
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                {mediaTitle}
              </DialogDescription>
            </div>
            <button
              onClick={() => setRemoveDialogOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
            >
              <span className="text-lg leading-none text-foreground">
                &times;
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={removeDeleteFiles}
                onChange={(e) => setRemoveDeleteFiles(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Delete files from disk
                </p>
                <p className="text-xs text-muted-foreground">
                  Remove downloaded files permanently.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={removeDeleteTorrent}
                onChange={(e) => setRemoveDeleteTorrent(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Remove from download client
                </p>
                <p className="text-xs text-muted-foreground">
                  Remove from qBittorrent. Stops seeding and frees the slot.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              disabled={removeFromLibrary.isPending || deleteTorrentMutation.isPending}
              onClick={() => void handleRemoveFromLibrary()}
            >
              {removeFromLibrary.isPending || deleteTorrentMutation.isPending
                ? "Removing..."
                : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete media confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="z-[60] max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold">
                Delete Media
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                {mediaTitle}
              </DialogDescription>
            </div>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
            >
              <span className="text-lg leading-none text-foreground">
                &times;
              </span>
            </button>
          </div>

          <div className="p-5">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete{" "}
              <span className="font-medium text-foreground">{mediaTitle}</span>?
              This will remove all metadata, seasons, episodes, and associated
              files. This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate({ id: mediaId })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
