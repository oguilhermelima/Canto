"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Button } from "@canto/ui/button";
import { Loader2, Volume2, VolumeX } from "lucide-react";

interface TorrentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  magnetUrl?: string | null;
}

export function TorrentPreview({
  open,
  onOpenChange,
  title,
  magnetUrl,
}: TorrentPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!open || !magnetUrl) {
      setStatus("loading");
      setErrorMsg("");
      return;
    }

    // Build the stream URL — the backend handles WebTorrent + HTTP range
    const streamUrl = `/api/stream?magnet=${encodeURIComponent(magnetUrl)}`;
    const video = videoRef.current;
    if (!video) return;

    setStatus("loading");

    video.src = streamUrl;
    video.load();

    const onCanPlay = () => setStatus("playing");
    const onError = () => {
      setStatus("error");
      const err = video.error;
      setErrorMsg(err?.message ?? "Failed to load video stream");
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();

      // Cleanup torrent on close
      const hashMatch = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetUrl);
      if (hashMatch?.[1]) {
        void fetch(`/api/stream?hash=${hashMatch[1]}`, { method: "DELETE" }).catch(() => {});
      }
    };
  }, [open, magnetUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="px-6 pb-0 pt-6">
          <DialogTitle className="truncate text-sm">{title}</DialogTitle>
        </DialogHeader>

        <div className="relative aspect-video bg-black">
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Connecting to peers & buffering...</p>
              <p className="text-xs text-white/50">
                Server-side streaming via WebTorrent (connects to all peers)
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-white">
              <p className="text-sm font-medium">Preview unavailable</p>
              <p className="max-w-md text-center text-xs text-white/60">{errorMsg}</p>
            </div>
          )}

          <video
            ref={videoRef}
            className="h-full w-full"
            controls={status === "playing"}
            autoPlay
            muted={muted}
            playsInline
          />

          {status === "playing" && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute bottom-14 right-4 h-8 w-8 rounded-full bg-black/60 p-0 text-white hover:bg-black/80"
              onClick={() => {
                setMuted((m) => !m);
                if (videoRef.current) videoRef.current.muted = !muted;
              }}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
