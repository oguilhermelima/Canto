"use client";

import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { toast } from "sonner";
import type { trpc } from "~/lib/trpc/client";

const REMOVE_CHECKBOXES = [
  {
    id: "deleteFiles",
    label: "Delete files from disk",
    description:
      "Permanently delete all downloaded and imported files from disk.",
  },
  {
    id: "removeTorrent",
    label: "Remove from download client",
    description:
      "Remove torrents from qBittorrent. Stops seeding and frees the slot.",
    defaultChecked: true,
  },
];

interface RemoveDialogProps {
  media: { id: string; title: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  open,
  onOpenChange,
  setMediaLibrary,
  deleteTorrentMutation,
  utils,
}: RemoveDialogProps): React.JSX.Element {
  const isPending =
    setMediaLibrary.isPending || deleteTorrentMutation.isPending;

  const handleConfirm = async (
    values: Record<string, boolean>,
  ): Promise<void> => {
    const deleteFiles = values.deleteFiles ?? false;
    const removeTorrent = values.removeTorrent ?? false;

    try {
      if (removeTorrent || deleteFiles) {
        const torrents = await utils.torrent.listByMedia.fetch({
          mediaId: media.id,
        });
        await Promise.all(
          torrents.map((t) =>
            deleteTorrentMutation
              .mutateAsync({
                id: t.id,
                deleteFiles,
                removeTorrent,
              })
              .catch(() => {}),
          ),
        );
      }
      await setMediaLibrary.mutateAsync({
        mediaId: media.id,
        libraryId: null,
      });
      void utils.media.getById.invalidate({ id: media.id });
      void utils.media.resolve.invalidate();
      void utils.library.list.invalidate();
      void utils.torrent.listByMedia.invalidate();
      onOpenChange(false);
      toast.success(`Removed "${media.title}" from library`);
    } catch {
      toast.error("Failed to remove from library");
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove from Library"
      description={media.title}
      body={
        <p className="text-sm text-muted-foreground">
          This will remove the item from your library. Choose what else to clean
          up:
        </p>
      }
      checkboxes={REMOVE_CHECKBOXES}
      onConfirm={(values) => void handleConfirm(values)}
      confirmLabel={isPending ? "Removing..." : "Remove"}
      variant="danger"
      loading={isPending}
    />
  );
}
