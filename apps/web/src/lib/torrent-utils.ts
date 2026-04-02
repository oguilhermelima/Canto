/* ─── Shared torrent display helpers ─── */

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || seconds >= 8640000) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatAge(days: number): string {
  if (days <= 0) return "new";
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function formatDownloadLabel(
  type: string,
  season?: number | null,
  episodes?: number[] | null,
): string {
  if (type === "movie") return "";
  if (type === "season" && season != null) return `Season ${season}`;
  if (type === "episode" && season != null && episodes?.length) {
    const sn = String(season).padStart(2, "0");
    const eps = episodes.map((e) => String(e).padStart(2, "0")).join(", ");
    return `S${sn}E${eps}`;
  }
  return "";
}

export function formatQualityLabel(quality: string): string {
  switch (quality) {
    case "uhd": return "4K";
    case "fullhd": return "1080p";
    case "hd": return "720p";
    case "sd": return "SD";
    default: return "";
  }
}

export function qualityBadge(
  quality: string,
): { label: string; className: string } | null {
  switch (quality) {
    case "uhd":
      return { label: "4K", className: "bg-violet-500/20 text-violet-300 border-violet-500/30" };
    case "fullhd":
      return { label: "1080p", className: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
    case "hd":
      return { label: "720p", className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" };
    case "sd":
      return { label: "SD", className: "bg-slate-500/20 text-slate-300 border-slate-500/30" };
    default:
      return null;
  }
}

export function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    remux: "Remux",
    bluray: "Blu-Ray",
    webdl: "WEB-DL",
    webrip: "WEBRip",
    hdtv: "HDTV",
    telesync: "TS",
    cam: "CAM",
    unknown: "",
  };
  return map[source] ?? source;
}

export function sourceBadge(
  source: string,
): { label: string; className: string } | null {
  const label = sourceLabel(source);
  if (!label) return null;
  switch (source) {
    case "remux":
    case "bluray":
      return { label, className: "bg-purple-500/15 text-purple-400 border-purple-500/20" };
    case "webdl":
    case "webrip":
      return { label, className: "bg-blue-500/15 text-blue-400 border-blue-500/20" };
    case "hdtv":
      return { label, className: "bg-teal-500/15 text-teal-400 border-teal-500/20" };
    case "telesync":
    case "cam":
      return { label, className: "bg-red-500/15 text-red-400 border-red-500/20" };
    default:
      return null;
  }
}

export function sourceColor(source: string): string {
  switch (source) {
    case "remux":
    case "bluray":
      return "bg-purple-500/15 text-purple-400";
    case "webdl":
    case "webrip":
      return "bg-blue-500/15 text-blue-400";
    case "hdtv":
      return "bg-teal-500/15 text-teal-400";
    case "telesync":
    case "cam":
      return "bg-red-500/15 text-red-400";
    default:
      return "";
  }
}

export interface ResolvedState {
  isDownloaded: boolean;
  label: string;
  color: string;
  seedingLabel?: string;
  seedingColor?: string;
  canPause: boolean;
  canResume: boolean;
  canRetry: boolean;
}

export function resolveState(dbStatus: string, liveState?: string, progress?: number): ResolvedState {
  const isCompleted = dbStatus === "completed" || dbStatus === "finished" || (progress != null && progress >= 1);

  if (isCompleted && liveState) {
    if (liveState.includes("paused")) {
      return {
        isDownloaded: true,
        label: "Downloaded",
        color: "bg-green-500/15 text-green-500",
        seedingLabel: "Seeding Paused",
        seedingColor: "bg-yellow-500/15 text-yellow-500",
        canPause: false,
        canResume: true,
        canRetry: false,
      };
    }
    return {
      isDownloaded: true,
      label: "Downloaded",
      color: "bg-green-500/15 text-green-500",
      seedingLabel: "Seeding",
      seedingColor: "bg-emerald-500/15 text-emerald-500",
      canPause: true,
      canResume: false,
      canRetry: false,
    };
  }

  if (isCompleted && !liveState) {
    return {
      isDownloaded: true,
      label: "Downloaded",
      color: "bg-green-500/15 text-green-500",
      canPause: false,
      canResume: false,
      canRetry: false,
    };
  }

  if (liveState) {
    if (liveState.includes("paused"))
      return { isDownloaded: false, label: "Paused", color: "bg-yellow-500/15 text-yellow-500", canPause: false, canResume: true, canRetry: false };
    if (liveState.includes("stalled") && liveState.includes("DL"))
      return { isDownloaded: false, label: "Stalled", color: "bg-orange-500/15 text-orange-500", canPause: true, canResume: false, canRetry: false };
    if (liveState === "downloading" || liveState === "forcedDL")
      return { isDownloaded: false, label: "Downloading", color: "bg-blue-500/15 text-blue-500", canPause: true, canResume: false, canRetry: false };
    if (liveState === "checkingDL" || liveState === "checkingUP" || liveState === "checkingResumeData")
      return { isDownloaded: false, label: "Checking", color: "bg-blue-500/15 text-blue-500", canPause: false, canResume: false, canRetry: false };
  }

  if (dbStatus === "paused")
    return { isDownloaded: false, label: "Paused", color: "bg-yellow-500/15 text-yellow-500", canPause: false, canResume: true, canRetry: false };
  if (dbStatus === "downloading")
    return { isDownloaded: false, label: "Downloading", color: "bg-blue-500/15 text-blue-500", canPause: false, canResume: false, canRetry: false };
  if (dbStatus === "cancelled")
    return { isDownloaded: false, label: "Cancelled", color: "bg-red-500/15 text-red-500", canPause: false, canResume: false, canRetry: true };
  if (dbStatus === "stalled")
    return { isDownloaded: false, label: "Stalled", color: "bg-orange-500/15 text-orange-500", canPause: false, canResume: false, canRetry: true };
  if (dbStatus === "incomplete")
    return { isDownloaded: false, label: "Incomplete", color: "bg-orange-500/15 text-orange-500", canPause: false, canResume: false, canRetry: true };
  if (dbStatus === "removed")
    return { isDownloaded: false, label: "Removed", color: "bg-red-500/15 text-red-500", canPause: false, canResume: false, canRetry: true };
  if (dbStatus === "error")
    return { isDownloaded: false, label: "Error", color: "bg-red-500/15 text-red-500", canPause: false, canResume: false, canRetry: true };
  return { isDownloaded: false, label: dbStatus, color: "bg-muted text-muted-foreground", canPause: false, canResume: false, canRetry: false };
}
