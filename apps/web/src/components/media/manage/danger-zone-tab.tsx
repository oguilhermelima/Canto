"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Check, Loader2, ShieldAlert, Trash2 } from "lucide-react";
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
  const hasRecoveryActions =
    !media.inLibrary || (!media.downloaded && media.inLibrary);

  return (
    <div className="space-y-5">
      {hasRecoveryActions && (
        <section className="rounded-2xl border border-border/60 bg-muted/[0.05] p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recovery actions
          </p>
          <div className="mt-3 space-y-4">
            {!media.inLibrary && (
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
            )}
            {!media.downloaded && media.inLibrary && (
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
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Remove from library
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stops tracking this title and optionally clears torrents/files.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
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
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
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
                Removes torrents from qBittorrent and stops seeding.
              </p>
            </div>
          </label>
        </div>

        <Button
          className="mt-4 w-full bg-red-500 text-white hover:bg-red-600"
          size="sm"
          disabled={removeFromServer.isPending || torrentDelete.isPending}
          onClick={async () => {
            if (
              mediaTorrents?.length &&
              (removeDeleteFiles || removeDeleteTorrent)
            ) {
              for (const t of mediaTorrents) {
                await torrentDelete.mutateAsync({
                  id: t.id,
                  deleteFiles: removeDeleteFiles,
                  removeTorrent: removeDeleteTorrent,
                });
              }
            }
            removeFromServer.mutate({ id: mediaId });
          }}
        >
          {removeFromServer.isPending
            ? "Removing..."
            : "Confirm Remove from Library"}
        </Button>
      </section>

      <section className="rounded-2xl border border-red-500/35 bg-red-500/[0.07] p-4 md:p-5">
        <p className="text-sm font-semibold text-foreground">Delete media</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Permanently deletes this title and all associated metadata. This
          action cannot be undone.
        </p>

        <div className="mt-4">
          {!confirmDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-400"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete media
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </section>
    </div>
  );
}
