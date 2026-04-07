"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";

export interface DeleteTarget {
  id: string;
  title: string;
}

export function DeleteDialog({
  target,
  onClose,
  onDelete,
  isPending,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  onDelete: (id: string, deleteFiles: boolean, removeTorrent: boolean) => void;
  isPending: boolean;
}): React.JSX.Element {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteTorrent, setDeleteTorrent] = useState(true);

  const handleClose = (): void => {
    onClose();
    setDeleteFiles(false);
    setDeleteTorrent(true);
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border bg-background">
        <DialogHeader>
          <DialogTitle>Remove Download</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove &quot;{target?.title}&quot;?
            This will remove the record from Canto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">Delete files from disk</p>
              <p className="text-xs text-muted-foreground">
                Remove imported files from the media library. Raw download files are not affected.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
            <input
              type="checkbox"
              checked={deleteTorrent}
              onChange={(e) => setDeleteTorrent(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">Remove from download client</p>
              <p className="text-xs text-muted-foreground">
                Remove the torrent from qBittorrent. Stops seeding and frees the slot.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className="bg-red-500 text-white hover:bg-red-600"
            onClick={() =>
              target && onDelete(target.id, deleteFiles, deleteTorrent)
            }
            disabled={isPending}
          >
            {isPending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
