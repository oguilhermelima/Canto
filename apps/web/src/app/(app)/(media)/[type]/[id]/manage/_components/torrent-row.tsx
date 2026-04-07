"use client";

import { cn } from "@canto/ui/cn";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import {
  Download,
  FolderInput,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { resolveState, formatBytes } from "~/lib/torrent-utils";

export interface TorrentItem {
  id: string;
  title: string;
  status: string;
  quality: string;
  source: string;
  progress: number;
  fileSize: number | null;
  contentPath: string | null;
  live: {
    state: string;
    progress: number;
    size: number;
    dlspeed: number;
    eta: number;
    seeds: number;
    peers: number;
  } | null;
}

function ItemActions({
  onDelete,
  onRename,
  onMove,
}: {
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={onRename} className="gap-2 text-xs">
          <Pencil className="h-3.5 w-3.5" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMove} className="gap-2 text-xs">
          <FolderInput className="h-3.5 w-3.5" /> Move
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-xs text-red-400 focus:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TorrentMiniRow({
  torrent: t,
  onPause,
  onResume,
  onRetry,
  onDelete,
  onRename,
  onMove,
}: {
  torrent: TorrentItem;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
}): React.JSX.Element {
  const state = resolveState(
    t.status,
    t.live?.state,
    t.live?.progress ?? t.progress,
  );
  const pct = Math.round((t.live?.progress ?? t.progress) * 100);

  return (
    <div className="flex items-center gap-2 text-xs">
      <Download className="h-3 w-3 shrink-0 text-blue-400" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {t.title}
      </span>
      <Badge
        variant="outline"
        className={cn("h-4 px-1 text-[9px]", state.color)}
      >
        {state.label}
      </Badge>
      {!state.isDownloaded && (
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      )}
      {(t.live?.size ?? t.fileSize) ? (
        <span className="text-muted-foreground">
          {formatBytes(t.live?.size ?? t.fileSize ?? 0)}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5">
        {state.canPause && (
          <button
            onClick={onPause}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pause className="h-3 w-3" />
          </button>
        )}
        {state.canResume && (
          <button
            onClick={onResume}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Play className="h-3 w-3" />
          </button>
        )}
        {state.canRetry && (
          <button
            onClick={onRetry}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
        <ItemActions onDelete={onDelete} onRename={onRename} onMove={onMove} />
      </div>
    </div>
  );
}

export function SeasonActions({
  onDelete,
  onRename,
  onMove,
  hasContent,
}: {
  onDelete: () => void;
  onRename: () => void;
  onMove: () => void;
  hasContent: boolean;
}): React.JSX.Element | null {
  if (!hasContent) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename} className="gap-2 text-xs">
          <Pencil className="h-3.5 w-3.5" /> Rename Season
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMove} className="gap-2 text-xs">
          <FolderInput className="h-3.5 w-3.5" /> Move Season
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-xs text-red-400 focus:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Season
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
