"use client";

import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@canto/ui/dialog";
import { toast } from "sonner";
import type { trpc } from "~/lib/trpc/client";

interface RemoveDialogProps {
  media: { id: string; title: string };
  removeDialogOpen: boolean;
  setRemoveDialogOpen: (open: boolean) => void;
  removeDeleteFiles: boolean;
  setRemoveDeleteFiles: (v: boolean) => void;
  removeDeleteTorrent: boolean;
  setRemoveDeleteTorrent: (v: boolean) => void;
  setMediaLibrary: {
    mutateAsync: (input: {
      mediaId: string;
      libraryId: string | null;
    }) => Promise<unknown>;
    isPending: boolean;
  };
  deleteTorrentMutation: {
    mutateAsync: (input: {
      id: string;
      deleteFiles: boolean;
      removeTorrent: boolean;
    }) => Promise<unknown>;
    isPending: boolean;
  };
  utils: ReturnType<typeof trpc.useUtils>;
}

export function RemoveDialog({
  media,
  removeDialogOpen,
  setRemoveDialogOpen,
  removeDeleteFiles,
  setRemoveDeleteFiles,
  removeDeleteTorrent,
  setRemoveDeleteTorrent,
  setMediaLibrary,
  deleteTorrentMutation,
  utils,
}: RemoveDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={removeDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRemoveDialogOpen(false);
          setRemoveDeleteFiles(false);
          setRemoveDeleteTorrent(true);
        }
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <DialogTitle className="text-lg font-semibold">
              Remove from Library
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
              {media.title}
            </DialogDescription>
          </div>
          <button
            onClick={() => setRemoveDialogOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
          >
            <span className="text-lg leading-none text-foreground">×</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            This will remove the item from your library. Choose what else to
            clean up:
          </p>

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
                Permanently delete all downloaded and imported files from disk.
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
                Remove torrents from qBittorrent. Stops seeding and frees the
                slot.
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
            disabled={
              setMediaLibrary.isPending || deleteTorrentMutation.isPending
            }
            onClick={async () => {
              if (!media) return;
              try {
                // Delete associated torrents first if requested
                if (removeDeleteTorrent || removeDeleteFiles) {
                  const torrents = await utils.torrent.listByMedia.fetch({
                    mediaId: media.id,
                  });
                  await Promise.all(
                    torrents.map((t) =>
                      deleteTorrentMutation
                        .mutateAsync({
                          id: t.id,
                          deleteFiles: removeDeleteFiles,
                          removeTorrent: removeDeleteTorrent,
                        })
                        .catch(() => {}),
                    ),
                  );
                }
                // Then remove from library by clearing libraryId
                await setMediaLibrary.mutateAsync({
                  mediaId: media.id,
                  libraryId: null,
                });
                void utils.media.getById.invalidate({ id: media.id });
                void utils.media.resolve.invalidate();
                void utils.library.list.invalidate();
                void utils.torrent.listByMedia.invalidate();
                setRemoveDialogOpen(false);
                toast.success(`Removed "${media.title}" from library`);
              } catch {
                toast.error("Failed to remove from library");
              }
            }}
          >
            {setMediaLibrary.isPending ? "Removing..." : "Remove"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
