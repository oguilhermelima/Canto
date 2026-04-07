"use client";

import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";

const TORRENT_CHECKBOXES = [
  {
    id: "deleteFiles",
    label: "Delete files from disk",
    description: "Remove downloaded files permanently.",
  },
  {
    id: "removeTorrent",
    label: "Remove from download client",
    description: "Remove from qBittorrent. Stops seeding and frees the slot.",
    defaultChecked: true,
  },
];

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
}: DeleteTorrentDialogProps): React.JSX.Element {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Torrent"
      description={title}
      checkboxes={TORRENT_CHECKBOXES}
      onConfirm={(values) =>
        onConfirm(values.deleteFiles ?? false, values.removeTorrent ?? false)
      }
      confirmLabel={isPending ? "Deleting..." : "Delete"}
      variant="danger"
      loading={isPending}
      className="z-[60]"
    />
  );
}
