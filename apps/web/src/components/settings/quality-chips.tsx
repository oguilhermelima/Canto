"use client";

import { Monitor, Film, Sparkles, Languages, HardDrive } from "lucide-react";
import { formatBytes } from "~/lib/torrent-utils";

export interface QualityMeta {
  resolution: string | null;
  videoCodec: string | null;
  hdr: string | null;
  primaryAudioLang: string | null;
  fileSize: number | null;
}

function normalizeResolution(res: string | null): string | null {
  if (!res) return null;
  const n = res.toLowerCase();
  if (n === "2160p" || n === "4k") return "4K";
  return res;
}

export function QualityChips({ meta }: { meta: QualityMeta }): React.JSX.Element | null {
  const resolution = normalizeResolution(meta.resolution);
  const hasAny =
    resolution ||
    meta.videoCodec ||
    meta.hdr ||
    meta.primaryAudioLang ||
    meta.fileSize != null;

  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {resolution && (
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Monitor size={12} className="text-muted-foreground" />
          {resolution}
        </span>
      )}
      {meta.videoCodec && (
        <span className="flex items-center gap-1.5 font-mono font-medium text-foreground">
          <Film size={12} className="text-muted-foreground" />
          {meta.videoCodec.toLowerCase()}
        </span>
      )}
      {meta.hdr && (
        <span className="flex items-center gap-1.5 font-medium text-amber-400">
          <Sparkles size={12} />
          {meta.hdr}
        </span>
      )}
      {meta.primaryAudioLang && (
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Languages size={12} className="text-muted-foreground" />
          {meta.primaryAudioLang}
        </span>
      )}
      {meta.fileSize != null && meta.fileSize > 0 && (
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <HardDrive size={12} className="text-muted-foreground" />
          {formatBytes(meta.fileSize)}
        </span>
      )}
    </div>
  );
}
