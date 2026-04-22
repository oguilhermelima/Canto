/* -------------------------------------------------------------------------- */
/*  Shared types + pure helpers for normalizing Jellyfin / Plex file info.    */
/*                                                                            */
/*  Both server APIs expose stream-level detail we classify beyond            */
/*  "1080p h264". We normalize into a provider-agnostic MediaFileInfo shape   */
/*  so the sync pipeline can persist it verbatim.                             */
/* -------------------------------------------------------------------------- */

export interface MediaFileInfo {
  seasonNumber?: number;
  episodeNumber?: number;
  serverEpisodeId?: string;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  fileSize?: number;
  filePath?: string;
  bitrate?: number;
  durationMs?: number;
  hdr?: string;
  primaryAudioLang?: string;
  audioLangs?: string[];
  subtitleLangs?: string[];
}

export function normalizeResolution(height?: number | null): string | undefined {
  if (!height) return undefined;
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return "SD";
}

export function normalizeLang(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  return raw.replace("_", "-");
}

export function dedupeLangs(raw: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const lang of raw) {
    const normalized = normalizeLang(lang);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}
