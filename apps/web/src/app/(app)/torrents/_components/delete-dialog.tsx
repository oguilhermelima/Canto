"use client";

import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";

export interface DeleteTarget {
  id: string;
  title: string;
}

const DELETE_CHECKBOXES = [
  {
    id: "deleteFiles",
    label: "Delete files from disk",
    description:
      "Remove imported files from the media library. Raw download files are not affected.",
  },
  {
    id: "removeTorrent",
    label: "Remove from download client",
    description:
      "Remove the torrent from qBittorrent. Stops seeding and frees the slot.",
    defaultChecked: true,
  },
];

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
  return (
    <ConfirmationDialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Remove Download"
      description={`Are you sure you want to remove "${target?.title ?? ""}"? This will remove the record from Canto.`}
      checkboxes={DELETE_CHECKBOXES}
      onConfirm={(values) =>
        target &&
        onDelete(
          target.id,
          values.deleteFiles ?? false,
          values.removeTorrent ?? false,
        )
      }
      confirmLabel={isPending ? "Removing..." : "Remove"}
      variant="danger"
      loading={isPending}
    />
  );
}
