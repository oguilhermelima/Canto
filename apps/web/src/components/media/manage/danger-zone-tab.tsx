"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Separator } from "@canto/ui/separator";
import { Check, Loader2, Trash2 } from "lucide-react";
import { SettingsRow } from "./settings-row";
import type { useManageModal } from "./use-manage-modal";

type ManageData = ReturnType<typeof useManageModal>;

interface DangerZoneTabProps {
  media: NonNullable<ManageData["media"]>;
  mediaId: string;
  mediaTorrents: ManageData["mediaTorrents"];
  removeFromServer: ManageData["removeFromServer"];
  addToLibrary: ManageData["addToLibrary"];
  markDownloaded: ManageData["markDownloaded"];
  deleteMutation: ManageData["deleteMutation"];
  torrentDelete: ManageData["torrentDelete"];
}

export function DangerZoneTab({
  media,
  mediaId,
  mediaTorrents,
  removeFromServer,
  addToLibrary,
  markDownloaded,
  deleteMutation,
  torrentDelete,
}: DangerZoneTabProps): React.JSX.Element {
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false);
  const [removeDeleteTorrent, setRemoveDeleteTorrent] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-6">
      {!media.inLibrary && (
        <>
          <SettingsRow
            label="Add to library"
            description="Track this media in your library"
          >
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={addToLibrary.isPending}
              onClick={() => addToLibrary.mutate({ id: mediaId })}
            >
              {addToLibrary.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Add to library
            </Button>
          </SettingsRow>
          <Separator />
        </>
      )}
      {!media.downloaded && media.inLibrary && (
        <>
          <SettingsRow
            label="Mark as downloaded"
            description="Confirm that files exist on disk for this media"
          >
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={markDownloaded.isPending}
              onClick={() => markDownloaded.mutate({ id: mediaId })}
            >
              {markDownloaded.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Mark as downloaded
            </Button>
          </SettingsRow>
          <Separator />
        </>
      )}
      <SettingsRow
        label="Remove from library"
        description="Remove this media from your library and untrack it"
      />
      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <label className="flex cursor-pointer items-start gap-3">
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
        <label className="flex cursor-pointer items-start gap-3">
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
              Remove from qBittorrent. Stops seeding.
            </p>
          </div>
        </label>
        <Button
          className="w-full bg-red-500 text-white hover:bg-red-600"
          size="sm"
          disabled={removeFromServer.isPending || torrentDelete.isPending}
          onClick={async () => {
            if (
              mediaTorrents?.length &&
              (removeDeleteFiles || removeDeleteTorrent)
            ) {
              for (const t of mediaTorrents) {
                await torrentDelete
                  .mutateAsync({
                    id: t.id,
                    deleteFiles: removeDeleteFiles,
                    removeTorrent: removeDeleteTorrent,
                  })
                  .catch(() => {});
              }
            }
            removeFromServer.mutate({ id: mediaId });
          }}
        >
          {removeFromServer.isPending
            ? "Removing..."
            : "Confirm Remove from Server"}
        </Button>
      </div>
      <Separator />
      <SettingsRow
        label="Delete media"
        description="Permanently delete this title and all associated data. This cannot be undone."
      >
        {!confirmDelete ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-red-500 text-white hover:bg-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate({ id: mediaId })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </SettingsRow>
    </div>
  );
}
