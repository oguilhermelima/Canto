"use client";

import { PlayCircle } from "lucide-react";

interface PlaybackProgressInfoProps {
  progressSeconds?: number;
  lastWatchedAt?: Date | string | null;
  source?: string | null;
  isCompleted?: boolean;
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function PlaybackProgressInfo({
  progressSeconds,
  lastWatchedAt,
  source,
  isCompleted,
}: PlaybackProgressInfoProps): React.JSX.Element | null {
  if (!lastWatchedAt) return null;

  const date = typeof lastWatchedAt === "string" ? new Date(lastWatchedAt) : lastWatchedAt;
  
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2 text-xs backdrop-blur-sm">
      <PlayCircle className="h-4 w-4 text-primary" />
      <div className="flex flex-col">
        <span className="font-medium text-foreground">
          {isCompleted ? "Finished watching" : `Last watched at ${formatTime(progressSeconds ?? 0)}`}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
          {source ? `On ${source} • ` : ""}
          {formatRelativeTime(date)}
        </span>
      </div>
    </div>
  );
}
