"use client";

import { cn } from "@canto/ui/cn";
import { Badge } from "@canto/ui/badge";
import { Button } from "@canto/ui/button";
import {
  Pause,
  Play,
  Trash2,
  RotateCcw,
  Download,
  ArrowDown,
  ArrowUp,
  Users,
  Clock,
} from "lucide-react";
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDownloadLabel,
  qualityBadge,
  sourceBadge,
  resolveState
  
} from "~/lib/torrent-utils";
import type {ResolvedState} from "~/lib/torrent-utils";

interface TorrentLive {
  state: string;
  progress: number;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  seeds: number;
  peers: number;
  addedOn: number;
  completedOn: number;
  ratio: number;
}

export interface TorrentWithLive {
  id: string;
  title: string;
  status: string;
  quality: string;
  source: string;
  progress: number;
  fileSize: number | null;
  imported: boolean;
  importing: boolean;
  downloadType: string;
  seasonNumber: number | null;
  episodeNumbers: number[] | null;
  live: TorrentLive | null;
}

interface TorrentCardProps {
  torrent: TorrentWithLive;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onRetry: (id: string) => void;
  onImport: (id: string) => void;
  compact?: boolean;
}

export function TorrentCard({
  torrent: t,
  onPause,
  onResume,
  onDelete,
  onRetry,
  onImport,
  compact,
}: TorrentCardProps) {
  const state: ResolvedState = resolveState(
    t.status,
    t.live?.state,
    t.live?.progress ?? t.progress,
  );
  const qb = qualityBadge(t.quality);
  const sb = sourceBadge(t.source);
  const dlLabel = formatDownloadLabel(t.downloadType, t.seasonNumber, t.episodeNumbers);
  const progress = t.live?.progress ?? t.progress;
  const progressPct = Math.round(progress * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {dlLabel && <span className="text-muted-foreground">{dlLabel} · </span>}
            {t.title}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", state.color.replace(/\/15\b/, "/60"))}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{progressPct}%</span>
            {t.live && t.live.dlspeed > 0 && (
              <span className="text-xs text-blue-400">{formatSpeed(t.live.dlspeed)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Title + badges */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
          {dlLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">{dlLabel}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {qb && <Badge variant="outline" className={qb.className}>{qb.label}</Badge>}
          {sb && <Badge variant="outline" className={sb.className}>{sb.label}</Badge>}
          <Badge variant="outline" className={state.color}>{state.label}</Badge>
          {state.seedingLabel && (
            <Badge variant="outline" className={state.seedingColor}>{state.seedingLabel}</Badge>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!state.isDownloaded && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", state.color.replace(/\/15\b/, "/60"))}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{progressPct}%</span>
        </div>
      )}

      {/* Live stats */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {t.live?.size ? (
          <span>{formatBytes(t.live.size)}</span>
        ) : t.fileSize ? (
          <span>{formatBytes(t.fileSize)}</span>
        ) : null}
        {t.live && !state.isDownloaded && (
          <>
            {t.live.dlspeed > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <ArrowDown className="h-3 w-3" />
                {formatSpeed(t.live.dlspeed)}
              </span>
            )}
            {t.live.upspeed > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <ArrowUp className="h-3 w-3" />
                {formatSpeed(t.live.upspeed)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {t.live.seeds} / {t.live.peers}
            </span>
            {t.live.eta > 0 && t.live.eta < 8640000 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatEta(t.live.eta)}
              </span>
            )}
          </>
        )}
        {t.live && state.isDownloaded && t.live.ratio > 0 && (
          <span>Ratio: {t.live.ratio.toFixed(2)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {state.canPause && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onPause(t.id)}>
            <Pause className="h-3 w-3" /> Pause
          </Button>
        )}
        {state.canResume && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onResume(t.id)}>
            <Play className="h-3 w-3" /> Resume
          </Button>
        )}
        {state.canRetry && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onRetry(t.id)}>
            <RotateCcw className="h-3 w-3" /> Retry
          </Button>
        )}
        {state.isDownloaded && !t.imported && !t.importing && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onImport(t.id)}>
            <Download className="h-3 w-3" /> Import
          </Button>
        )}
        {t.importing && (
          <Badge variant="outline" className="bg-blue-500/15 text-blue-400">Importing...</Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-400"
          onClick={() => onDelete(t.id, t.title)}
        >
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>
    </div>
  );
}
