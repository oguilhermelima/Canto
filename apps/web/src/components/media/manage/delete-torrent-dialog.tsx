"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";

interface DeleteTorrentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onConfirm: (deleteFiles: boolean, removeTorrent: boolean) => void;
  isPending: boolean;
}

export function DeleteTorrentDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
  isPending,
}: DeleteTorrentDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [removeTorrent, setRemoveTorrent] = useState(true);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDeleteFiles(false);
          setRemoveTorrent(true);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="z-[60] max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <DialogTitle className="text-lg font-semibold">Delete Torrent</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
              {title}
            </DialogDescription>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
          >
            <span className="text-lg leading-none text-foreground">×</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
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
                Remove downloaded files permanently.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
            <input
              type="checkbox"
              checked={removeTorrent}
              onChange={(e) => setRemoveTorrent(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">Remove from download client</p>
              <p className="text-xs text-muted-foreground">
                Remove from qBittorrent. Stops seeding and frees the slot.
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500 text-white hover:bg-red-600"
            disabled={isPending}
            onClick={() => onConfirm(deleteFiles, removeTorrent)}
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
