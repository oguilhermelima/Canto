"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Switch } from "@canto/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@canto/ui/dialog";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

interface ProviderOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  targetProvider: "tmdb" | "tvdb" | null;
  onSuccess: () => void;
}

export function ProviderOverrideDialog({
  open,
  onOpenChange,
  mediaId,
  targetProvider,
  onSuccess,
}: ProviderOverrideDialogProps): React.JSX.Element {
  const [renameFiles, setRenameFiles] = useState(false);
  const [updateServer, setUpdateServer] = useState(false);

  const preview = trpc.media.previewProviderOverride.useQuery(
    { id: mediaId, overrideProviderFor: targetProvider },
    { enabled: open },
  );

  const apply = trpc.media.applyProviderOverride.useMutation({
    onSuccess: () => {
      toast.success("Provider updated");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const providerLabel =
    targetProvider === "tvdb"
      ? "TVDB"
      : targetProvider === "tmdb"
        ? "TMDB"
        : "global setting";
  const hasFiles = (preview.data?.fileCount ?? 0) > 0;
  const hasServer = preview.data?.hasMediaServer ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to {providerLabel}</DialogTitle>
          <DialogDescription>
            This will change the season and episode structure for this show.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <p>
                Current structure: {preview.data?.currentSeasonCount ?? 0}{" "}
                seasons
              </p>
              {hasFiles && (
                <p>{preview.data?.fileCount} imported files on disk</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Rename files on disk</p>
                  <p className="text-xs text-muted-foreground">
                    Reorganize folders and filenames to match the new structure
                  </p>
                </div>
                <Switch
                  checked={renameFiles}
                  onCheckedChange={setRenameFiles}
                  disabled={!hasFiles}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Update on Jellyfin/Plex</p>
                  <p className="text-xs text-muted-foreground">
                    Refresh metadata on connected media servers
                  </p>
                </div>
                <Switch
                  checked={updateServer}
                  onCheckedChange={setUpdateServer}
                  disabled={!hasServer}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              apply.mutate({
                id: mediaId,
                overrideProviderFor: targetProvider,
                renameFiles,
                updateMediaServer: updateServer,
              })
            }
            disabled={apply.isPending || preview.isLoading}
          >
            {apply.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
