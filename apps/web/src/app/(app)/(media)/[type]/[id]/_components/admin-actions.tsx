"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@canto/ui/cn";
import { Download } from "lucide-react";
import { resolveState } from "@/lib/torrent-utils";

interface AdminActionsProps {
  media: {
    type: string;
    externalId: number | null;
    inLibrary: boolean;
  };
  isAdmin: boolean;
  mediaType: "movie" | "show";
  liveTorrents: Array<{
    status: string;
    progress: number;
    live?: { state: string; progress: number } | null;
  }>;
  onOpenDownload: () => void;
}

type DownloadButtonState = "default" | "downloading" | "paused" | "downloaded";

export function AdminActions({
  media,
  isAdmin,
  mediaType: _mediaType,
  liveTorrents,
  onOpenDownload,
}: AdminActionsProps): React.JSX.Element | null {
  const analyzed = useMemo(
    () =>
      liveTorrents.map((torrent) => {
        const resolved = resolveState(
          torrent.status,
          torrent.live?.state,
          torrent.live?.progress ?? torrent.progress,
        );
        const progress = Math.max(
          0,
          Math.min(1, torrent.live?.progress ?? torrent.progress),
        );
        return { resolved, progress };
      }),
    [liveTorrents],
  );

  const downloadedCount = analyzed.filter((item) => item.resolved.isDownloaded).length;
  const pausedCount = analyzed.filter(
    (item) => !item.resolved.isDownloaded && item.resolved.canResume,
  ).length;
  const downloadingItems = analyzed.filter(
    (item) => !item.resolved.isDownloaded && !item.resolved.canResume,
  );
  const downloadingCount = downloadingItems.length;
  const progressPct =
    downloadingCount > 0
      ? Math.round(
          (downloadingItems.reduce((sum, item) => sum + item.progress, 0) /
            downloadingCount) *
            100,
        )
      : 0;

  const buttonState: DownloadButtonState =
    downloadingCount > 0
      ? "downloading"
      : pausedCount > 0
        ? "paused"
        : downloadedCount > 0
          ? "downloaded"
          : "default";

  const title =
    buttonState === "downloading"
      ? "Downloading"
      : buttonState === "paused"
        ? "Download Paused"
        : "Download";
  const downloadedTitles = useMemo(() => {
    const versionsLabel =
      downloadedCount === 1
        ? "1 version downloaded"
        : `${downloadedCount} versions downloaded`;
    return ["Download", versionsLabel, "Download variant"];
  }, [downloadedCount]);
  const loopedDownloadedTitles = useMemo(
    () => [...downloadedTitles, downloadedTitles[0] ?? "Download"],
    [downloadedTitles],
  );
  const [downloadedTitleIndex, setDownloadedTitleIndex] = useState(0);
  const [isLoopResetting, setIsLoopResetting] = useState(false);

  // Reset loop state when buttonState transitions away from "downloaded" —
  // useState snapshot pattern (React docs: "You Might Not Need an Effect").
  const [prevButtonState, setPrevButtonState] = useState(buttonState);
  if (buttonState !== prevButtonState) {
    setPrevButtonState(buttonState);
    if (buttonState !== "downloaded") {
      setDownloadedTitleIndex(0);
      setIsLoopResetting(false);
    }
  }

  useEffect(() => {
    if (buttonState !== "downloaded") return;
    const timer = window.setInterval(() => {
      setDownloadedTitleIndex((current) => current + 1);
    }, 3400);
    return () => window.clearInterval(timer);
  }, [buttonState]);

  useEffect(() => {
    if (buttonState !== "downloaded") return;
    if (downloadedTitleIndex < downloadedTitles.length) return;
    const resetTimer = window.setTimeout(() => {
      setIsLoopResetting(true);
      setDownloadedTitleIndex(0);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setIsLoopResetting(false);
        });
      });
    }, 520);
    return () => window.clearTimeout(resetTimer);
  }, [buttonState, downloadedTitleIndex, downloadedTitles.length]);

  if (!isAdmin) return null;

  return (
    <section className="flex flex-col items-stretch gap-3 px-4 md:flex-row md:items-center md:gap-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <div className="w-full flex-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Download className="h-4 w-4 text-muted-foreground" />
          Download
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {media.inLibrary
            ? "Download another version for this title."
            : "Search for torrents to download this content."}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenDownload}
        className={cn(
          "relative isolate inline-flex h-11 w-full overflow-hidden rounded-xl border text-left backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 md:w-auto",
          (buttonState === "default" || buttonState === "downloaded") &&
            "border-foreground/20 bg-foreground/15 text-foreground hover:bg-foreground/25",
          buttonState === "downloading" &&
            "border-blue-400/45 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30",
          buttonState === "paused" &&
            "border-amber-400/45 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30",
        )}
      >
        {buttonState === "downloading" && (
          <span
            className="absolute inset-y-0 left-0 -z-10 bg-blue-300/35 transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        )}
        <span className="flex flex-1 items-center justify-center px-5 md:min-w-[230px]">
          <span className="flex min-w-0 text-center leading-tight">
            {buttonState === "downloaded" ? (
              <span className="relative block h-5 overflow-hidden text-sm font-semibold">
                <span
                  className={cn(
                    "block transition-transform duration-500 ease-out",
                    isLoopResetting && "duration-0",
                  )}
                  style={{
                    transform: `translateY(-${downloadedTitleIndex * 20}px)`,
                  }}
                >
                  {loopedDownloadedTitles.map((step, index) => (
                    <span key={`${step}-${index}`} className="block h-5 leading-5">
                      {step}
                    </span>
                  ))}
                </span>
              </span>
            ) : (
              <span className="text-sm font-semibold">{title}</span>
            )}
          </span>
        </span>
        <span
          className={cn(
            "flex w-12 items-center justify-center border-l",
            (buttonState === "default" || buttonState === "downloaded") &&
              "border-foreground/20 bg-foreground/10",
            buttonState === "downloading" &&
              "border-blue-300/30 bg-blue-500/15 text-blue-100",
            buttonState === "paused" &&
              "border-amber-300/30 bg-amber-500/15 text-amber-50",
          )}
        >
          <Download className="h-5 w-5" />
        </span>
      </button>
    </section>
  );
}
