"use client";

import Image from "next/image";
import { CheckCircle2, History } from "lucide-react";
import { cn } from "@canto/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@canto/ui/dialog";
import { HistoryPanel } from "./history-panel";
import { TrackPanel } from "./track-panel";
import type { WatchTrackingButtonProps } from "./types";
import { useWatchedToggle } from "./use-watched-toggle";
import { statusButtonClass, statusIcon, statusLabel } from "./utils";

export type { WatchTrackingButtonProps } from "./types";

export function WatchTrackingButton({
  mediaId,
  mediaType,
  title,
  backdropPath,
  trackingStatus = "none",
  seasons = [],
  className,
}: WatchTrackingButtonProps): React.JSX.Element {
  const isMovie = mediaType === "movie";
  const toggle = useWatchedToggle({
    mediaId,
    mediaType,
    seasons,
    trackingStatus,
  });
  const { open, setOpen, activeTab, setActiveTab, normalizedStatus } = toggle;

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex h-11 min-w-[190px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
          statusButtonClass(normalizedStatus),
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {statusIcon(normalizedStatus)}
        <span>{statusLabel(normalizedStatus)}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-3xl [&>button:last-child]:hidden">
          <div className="relative shrink-0 overflow-hidden">
            {backdropPath && (
              <>
                <Image
                  src={
                    backdropPath.startsWith("http")
                      ? backdropPath
                      : `https://image.tmdb.org/t/p/w780${backdropPath}`
                  }
                  alt=""
                  fill
                  className="object-cover object-center"
                  sizes="600px"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
              </>
            )}
            <div
              className={cn(
                "relative px-5 pb-5 md:px-6",
                backdropPath ? "pt-14" : "pt-5",
              )}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-xl font-bold">
                    {activeTab === "track" ? "I watched..." : "Watch history"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 truncate text-sm text-foreground">
                    {title}
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(activeTab === "track" ? "history" : "track")
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {activeTab === "track" ? (
                    <>
                      <History className="h-3.5 w-3.5" /> History
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Track
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {activeTab === "track" ? (
            <TrackPanel isMovie={isMovie} toggle={toggle} />
          ) : (
            <HistoryPanel toggle={toggle} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
