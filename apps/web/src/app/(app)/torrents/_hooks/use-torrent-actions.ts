"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { buildFallbackMagnet } from "../_lib/build-fallback-magnet";

interface TorrentActionTarget {
  id: string;
  hash: string | null;
  title: string;
  magnetUrl: string | null;
}

interface UseTorrentActionsArgs {
  torrents: TorrentActionTarget[];
  onAfterDelete?: () => void;
}

export interface TorrentActions {
  pause: (id: string) => void;
  resume: (id: string) => void;
  retry: (id: string) => void;
  forceResume: (id: string) => void;
  forceRecheck: (id: string) => void;
  forceReannounce: (id: string) => void;
  copyMagnet: (id: string) => void;
  remove: (id: string, deleteFiles: boolean, removeTorrent: boolean) => void;
  pausePending: boolean;
  resumePending: boolean;
  retryPending: boolean;
  advancedPending: boolean;
  deletePending: boolean;
}

export function useTorrentActions({
  torrents,
  onAfterDelete,
}: UseTorrentActionsArgs): TorrentActions {
  const utils = trpc.useUtils();
  const invalidate = useCallback(() => {
    void utils.torrent.listLive.invalidate();
    void utils.torrent.listClient.invalidate();
  }, [utils]);

  const onErr = (err: { message: string }): void => {
    toast.error(err.message);
  };

  const pauseMutation = trpc.torrent.pause.useMutation({
    onSuccess: invalidate,
    onError: onErr,
  });
  const resumeMutation = trpc.torrent.resume.useMutation({
    onSuccess: invalidate,
    onError: onErr,
  });
  const retryMutation = trpc.torrent.retry.useMutation({
    onSuccess: invalidate,
    onError: onErr,
  });
  const forceResumeMutation = trpc.torrent.forceResume.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Force resume sent");
    },
    onError: onErr,
  });
  const forceRecheckMutation = trpc.torrent.forceRecheck.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Force recheck sent");
    },
    onError: onErr,
  });
  const forceReannounceMutation = trpc.torrent.forceReannounce.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Force reannounce sent");
    },
    onError: onErr,
  });
  const deleteMutation = trpc.torrent.delete.useMutation({
    onSuccess: () => {
      invalidate();
      onAfterDelete?.();
    },
    onError: onErr,
  });

  const copyMagnet = useCallback(
    (id: string) => {
      const target = torrents.find((item) => item.id === id);
      if (!target) return;
      const link =
        target.magnetUrl ??
        (target.hash ? buildFallbackMagnet(target.hash, target.title) : null);
      if (!link) {
        toast.error("This torrent has no magnetic link");
        return;
      }
      void navigator.clipboard
        .writeText(link)
        .then(() => toast.success("Magnetic link copied"))
        .catch(() => toast.error("Could not copy magnetic link"));
    },
    [torrents],
  );

  const advancedPending =
    forceResumeMutation.isPending ||
    forceRecheckMutation.isPending ||
    forceReannounceMutation.isPending;

  return {
    pause: (id) => pauseMutation.mutate({ id }),
    resume: (id) => resumeMutation.mutate({ id }),
    retry: (id) => retryMutation.mutate({ id }),
    forceResume: (id) => forceResumeMutation.mutate({ id }),
    forceRecheck: (id) => forceRecheckMutation.mutate({ id }),
    forceReannounce: (id) => forceReannounceMutation.mutate({ id }),
    copyMagnet,
    remove: (id, deleteFiles, removeTorrent) =>
      deleteMutation.mutate({ id, deleteFiles, removeTorrent }),
    pausePending: pauseMutation.isPending,
    resumePending: resumeMutation.isPending,
    retryPending: retryMutation.isPending,
    advancedPending,
    deletePending: deleteMutation.isPending,
  };
}
