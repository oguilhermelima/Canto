"use client";

import { memo } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Download,
  Film as FilmIcon,
  Globe,
  HardDrive,
  Monitor,
  Target,
  Zap,
} from "lucide-react";
import {
  formatAge,
  formatBytes,
  formatQualityLabel,
  sourceLabel,
} from "@/lib/torrent-utils";
import { ConfidenceChip, type ConfidenceBreakdown } from "./confidence-chip";

export interface TorrentResult {
  guid: string;
  title: string;
  magnetUrl: string | null;
  downloadUrl: string | null;
  quality: string;
  source: string;
  confidence: number;
  breakdown?: ConfidenceBreakdown;
  seeders: number;
  leechers: number;
  size: number;
  age: number;
  indexer: string;
  indexerLanguage?: string | null;
  languages: string[];
  flags: string[];
  aboveCutoff?: boolean;
}

interface TorrentCardProps {
  torrent: TorrentResult;
  onDownload: (url: string, title: string) => void;
  downloadDisabled: boolean;
}

function TorrentCardComponent({
  torrent: t,
  onDownload,
  downloadDisabled,
}: TorrentCardProps): React.JSX.Element {
  const url = t.magnetUrl ?? t.downloadUrl;
  const qLabel = formatQualityLabel(t.quality);
  const sLabel = sourceLabel(t.source);
  const hasFreeleech = t.flags.some((f) => f.includes("freeleech"));

  return (
    <div className="overflow-hidden rounded-xl bg-muted/40 transition-colors hover:bg-muted/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-2">
          <span>
            {t.indexer || "Unknown"}
            {t.indexerLanguage && (
              <span className="ml-1 text-muted-foreground">
                ({t.indexerLanguage})
              </span>
            )}
          </span>
          {t.aboveCutoff && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
              title="Hits your download profile's target. Downloading this stops the search for further upgrades."
            >
              <Target size={9} />
              Meets target
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {formatAge(t.age)}
        </span>
      </div>

      {/* Body */}
      <div className="flex items-start gap-4 border-t border-border px-5 py-4">
        <ConfidenceChip score={t.confidence} breakdown={t.breakdown} />

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
            {t.title}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
            {qLabel && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Monitor size={12} className="text-muted-foreground" />
                {qLabel}
              </span>
            )}
            {sLabel && (
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <FilmIcon size={12} className="text-muted-foreground" />
                {sLabel}
              </span>
            )}
            {t.size > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <HardDrive size={12} className="text-muted-foreground" />
                {formatBytes(t.size)}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => url && onDownload(url, t.title)}
          disabled={!url || downloadDisabled}
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:scale-110 hover:text-foreground disabled:opacity-40"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-5 py-2.5 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ArrowUp size={12} className="text-muted-foreground" />
          {t.seeders} seeders
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ArrowDown size={12} className="text-muted-foreground" />
          {t.leechers} peers
        </span>
        {t.languages.length > 0 && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Globe size={12} className="text-muted-foreground" />
            {t.languages.map((l) => l.toUpperCase()).join(", ")}
          </span>
        )}
        {hasFreeleech && (
          <span className="flex items-center gap-1.5 font-medium text-blue-400">
            <Zap size={12} />
            Freeleech
          </span>
        )}
      </div>
    </div>
  );
}

export const TorrentCard = memo(TorrentCardComponent);
