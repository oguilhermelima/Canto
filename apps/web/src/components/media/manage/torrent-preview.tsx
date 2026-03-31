"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  hash: string;
  title: string;
  magnetUrl?: string | null;
}

function buildMagnet(hash: string): string {
  const trackers = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
  ];
  const params = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${hash}${params}`;
}

/** Load WebTorrent browser bundle (the dist/ build avoids Node.js polyfill issues) */
async function loadWebTorrent(): Promise<unknown> {
  // Import the pre-built browser bundle from the npm package
  const mod = await import("webtorrent/dist/webtorrent.min.js");
  return mod.default ?? mod;
}

export function TorrentPreview({
  open,
  onOpenChange,
  hash,
  title,
  magnetUrl,
}: TorrentPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "buffering" | "playing" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);

  const cleanup = useCallback(() => {
    try {
      if (clientRef.current?.destroy) clientRef.current.destroy();
    } catch { /* best-effort */ }
    clientRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      setStatus("loading");
      setProgress(0);
      setErrorMsg("");
      return;
    }

    let destroyed = false;

    async function startStream() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const WT = await loadWebTorrent() as any;
        if (destroyed) return;

        const client = new WT();
        clientRef.current = client;

        const magnet = magnetUrl || buildMagnet(hash);
        setStatus("buffering");

        const torrent = client.add(magnet);

        torrent.on("download", () => {
          if (destroyed) return;
          setProgress(Math.round(torrent.progress * 100));
        });

        torrent.on("ready", () => {
          if (destroyed) return;

          const videoExts = [".mp4", ".mkv", ".avi", ".webm", ".mov", ".m4v"];
          const sorted = [...torrent.files].sort(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any, b: any) => b.length - a.length,
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const videoFile = sorted.find((f: any) =>
            videoExts.some((ext) => f.name.toLowerCase().endsWith(ext)),
          );

          if (!videoFile) {
            setStatus("error");
            setErrorMsg("No video file found in torrent");
            return;
          }

          videoFile.renderTo(videoRef.current!, (err: Error | undefined) => {
            if (destroyed) return;
            if (err) {
              setStatus("error");
              setErrorMsg(err.message ?? "Cannot play this format in browser");
            } else {
              setStatus("playing");
            }
          });
        });

        client.on("error", (err: Error) => {
          if (destroyed) return;
          setStatus("error");
          setErrorMsg(err.message ?? "WebTorrent error");
        });
      } catch (err) {
        if (!destroyed) {
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : "Failed to start WebTorrent");
        }
      }
    }

    void startStream();

    return () => {
      destroyed = true;
      cleanup();
    };
  }, [open, hash, magnetUrl, cleanup]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="px-6 pb-0 pt-6">
          <DialogTitle className="truncate text-sm">{title}</DialogTitle>
        </DialogHeader>

        <div className="relative aspect-video bg-black">
          {(status === "loading" || status === "buffering") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">
                {status === "loading" ? "Connecting to peers..." : `Buffering... ${progress}%`}
              </p>
              <p className="text-xs text-white/50">
                Streaming via WebTorrent (peer-to-peer in browser)
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-white">
              <p className="text-sm font-medium">Preview unavailable</p>
              <p className="max-w-md text-center text-xs text-white/60">{errorMsg}</p>
              <p className="mt-2 text-xs text-white/40">
                WebTorrent needs WebRTC peers. Some trackers/formats may not work in-browser.
              </p>
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
              className="absolute bottom-4 right-4 h-8 w-8 rounded-full bg-black/60 p-0 text-white hover:bg-black/80"
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
