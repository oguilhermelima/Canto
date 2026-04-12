"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { resolveState } from "~/lib/torrent-utils";

function epKey(sn: number, en: number): string {
  return `S${String(sn).padStart(2, "0")}E${String(en).padStart(2, "0")}`;
}

export { epKey };

export function useManageModal(
  mediaId: string,
  mediaType: "movie" | "show",
  open: boolean,
  onClose: () => void,
) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Media is already resolved — fetch by internal ID
  const { data: media, isLoading } = trpc.media.getById.useQuery(
    { id: mediaId },
    { enabled: open },
  );

  // ── Queries ──
  const { data: libraries } = trpc.folder.list.useQuery(undefined, {
    staleTime: Infinity,
    enabled: open,
  });
  const { data: availability } = trpc.sync.mediaAvailability.useQuery(
    { mediaId },
    { enabled: open, staleTime: Infinity },
  );
  const { data: mediaServers } = trpc.sync.mediaServers.useQuery(
    { mediaId },
    { enabled: open, staleTime: Infinity },
  );
  const { data: liveTorrents, isLoading: torrentsLoading } =
    trpc.torrent.listLiveByMedia.useQuery(
      { mediaId },
      {
        enabled: open,
        refetchInterval: (query) => {
          const items = query.state.data;
          if (!items) return 3000;
          return items.some(
            (t) =>
              !resolveState(
                t.status,
                t.live?.state,
                t.live?.progress ?? t.progress,
              ).isDownloaded,
          )
            ? 3000
            : 30000;
        },
      },
    );
  const { data: mediaFiles } = trpc.media.listFiles.useQuery(
    { mediaId },
    { enabled: open, staleTime: 60_000 },
  );
  const { data: mediaTorrents } = trpc.torrent.listByMedia.useQuery(
    { mediaId },
    { enabled: open },
  );

  // ── Invalidation helpers ──
  const invalidateMedia = useCallback(() => {
    void utils.media.getById.invalidate({ id: mediaId });
    void utils.media.getByExternal.invalidate();
  }, [utils, mediaId]);

  const invalidateTorrents = useCallback(() => {
    void utils.torrent.listLiveByMedia.invalidate({ mediaId });
    void utils.torrent.listByMedia.invalidate({ mediaId });
    void utils.media.listFiles.invalidate({ mediaId });
  }, [utils, mediaId]);

  // ── Mutations ──
  const setMediaLibrary = trpc.library.setMediaLibrary.useMutation({
    onSuccess: () => {
      invalidateMedia();
      toast.success("Library updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const setContinuousDownload = trpc.library.setContinuousDownload.useMutation({
    onSuccess: () => {
      invalidateMedia();
      toast.success("Auto-download updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const refreshMeta = trpc.media.updateMetadata.useMutation({
    onSuccess: () => {
      invalidateMedia();
      toast.success("Metadata refreshed");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeFromServer = trpc.media.removeFromLibrary.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Removed from server");
      onClose();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const addToLibrary = trpc.media.addToLibrary.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Added to library");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const markDownloaded = trpc.media.markDownloaded.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Marked as downloaded");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => {
      invalidateMedia();
      void utils.library.list.invalidate();
      toast.success("Media deleted");
      onClose();
      router.push("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const torrentPause = trpc.torrent.pause.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentResume = trpc.torrent.resume.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentDelete = trpc.torrent.delete.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentRetry = trpc.torrent.retry.useMutation({
    onSuccess: invalidateTorrents,
    onError: (err) => toast.error(err.message),
  });
  const torrentRename = trpc.torrent.rename.useMutation({
    onSuccess: () => {
      invalidateTorrents();
      toast.success("Renamed");
    },
    onError: (err) => toast.error(err.message),
  });
  const torrentMove = trpc.torrent.move.useMutation({
    onSuccess: () => {
      invalidateTorrents();
      toast.success("Moved");
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Derived data ──
  const seasons = media?.seasons ?? [];

  const filesByEpKey = useMemo(() => {
    const map = new Map<string, NonNullable<typeof mediaFiles>>();
    if (!mediaFiles) return map;
    for (const f of mediaFiles) {
      const sn = f.episode?.season.number;
      const en = f.episode?.number;
      if (sn == null || en == null) continue;
      const key = epKey(sn, en);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [mediaFiles]);

  const movieFiles = useMemo(
    () => mediaFiles?.filter((f) => !f.episode) ?? [],
    [mediaFiles],
  );

  const torrentsBySeason = useMemo(() => {
    const map = new Map<number, NonNullable<typeof liveTorrents>>();
    if (!liveTorrents) return map;
    for (const t of liveTorrents) {
      const sn = t.seasonNumber ?? -1;
      if (!map.has(sn)) map.set(sn, []);
      map.get(sn)!.push(t);
    }
    return map;
  }, [liveTorrents]);

  return {
    media,
    mediaId,
    isLoading,
    mediaType,
    seasons,
    libraries,
    availability,
    mediaServers,
    liveTorrents,
    torrentsLoading,
    mediaFiles,
    mediaTorrents,
    filesByEpKey,
    movieFiles,
    torrentsBySeason,
    setMediaLibrary,
    setContinuousDownload,
    invalidateMedia,
    refreshMeta,
    removeFromServer,
    addToLibrary,
    markDownloaded,
    deleteMutation,
    torrentPause,
    torrentResume,
    torrentDelete,
    torrentRetry,
    torrentRename,
    torrentMove,
  };
}
