"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { readFileAsBase64 } from "../_lib/read-file-base64";

interface UseTorrentFileUploadArgs {
  onUploaded?: () => void;
}

export interface TorrentFileUpload {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectTorrentFile: () => void;
  handleTorrentFileChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
}

export function useTorrentFileUpload({
  onUploaded,
}: UseTorrentFileUploadArgs = {}): TorrentFileUpload {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addTorrentFile = trpc.torrent.addTorrentFile.useMutation({
    onSuccess: () => {
      onUploaded?.();
      toast.success(".torrent imported");
    },
    onError: (err) => toast.error(err.message),
  });

  const selectTorrentFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleTorrentFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const base64 = await readFileAsBase64(file);
        await addTorrentFile.mutateAsync({
          fileName: file.name,
          fileBase64: base64,
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to import .torrent",
        );
      }
    },
    [addTorrentFile],
  );

  return { fileInputRef, selectTorrentFile, handleTorrentFileChange };
}
