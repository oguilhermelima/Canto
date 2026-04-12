"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { Search, Download } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { resolveState } from "~/lib/torrent-utils";
import { TorrentCard  } from "./torrent-card";
import type {TorrentWithLive} from "./torrent-card";
import { DeleteTorrentDialog } from "./delete-torrent-dialog";

interface DownloadsTabProps {
  mediaId: string;
  drawerOpen: boolean;
  onSearchTorrent: () => void;
}

export function DownloadsTab({
  mediaId,
  drawerOpen,
  onSearchTorrent,
}: DownloadsTabProps) {
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.torrent.listLiveByMedia.useQuery(
    { mediaId },
    {
      enabled: drawerOpen,
      refetchInterval: (query) => {
        const items = query.state.data;
        if (!items) return 3000;
        const hasActive = items.some(
          (t) =>
            !resolveState(
              t.status,
              t.live?.state,
              t.live?.progress ?? t.progress,
            ).isDownloaded,
        );
        return hasActive ? 3000 : 30000;
      },
    },
  );

  const invalidate = () => utils.torrent.listLiveByMedia.invalidate();

  const pauseMutation = trpc.torrent.pause.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const resumeMutation = trpc.torrent.resume.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.torrent.delete.useMutation({
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const retryMutation = trpc.torrent.retry.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const importMutation = trpc.torrent.import.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Import started");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Downloads</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onSearchTorrent}
        >
          <Search className="h-3 w-3" />
          Search Torrent
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data?.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
          <Download className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              No downloads yet
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Search for a torrent to start downloading.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-1 gap-1.5 text-xs"
            onClick={onSearchTorrent}
          >
            <Search className="h-3 w-3" />
            Search Torrent
          </Button>
        </div>
      )}

      {/* Torrent list */}
      {!isLoading && data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((torrent: TorrentWithLive) => (
            <TorrentCard
              key={torrent.id}
              torrent={torrent}
              onPause={(id) => pauseMutation.mutate({ id })}
              onResume={(id) => resumeMutation.mutate({ id })}
              onDelete={(id, title) => setDeleteTarget({ id, title })}
              onRetry={(id) => retryMutation.mutate({ id })}
              onImport={(id) => importMutation.mutate({ id })}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <DeleteTorrentDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget?.title ?? ""}
        onConfirm={(deleteFiles, removeTorrent) => {
          if (deleteTarget) {
            deleteMutation.mutate({
              id: deleteTarget.id,
              deleteFiles,
              removeTorrent,
            });
          }
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
