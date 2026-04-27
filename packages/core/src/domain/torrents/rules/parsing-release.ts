/* ── Release group detection ── */

export function detectReleaseGroup(title: string): string | null {
  // Standard pattern: "-GroupName" at end (before optional extension)
  // e.g. "Movie.2024.1080p.WEB-DL.x265-FLUX" → "FLUX"
  // e.g. "Movie.2024.1080p.WEB-DL.x265-FLUX[rarbg]" → "FLUX"
  const match = /-([A-Za-z0-9]+)(?:\[.*\])?(?:\.\w{2,4})?$/.exec(title);
  if (match?.[1]) {
    const group = match[1];
    // Filter out common false positives (codecs, sources, audio codecs)
    const falsePositives = new Set([
      "dl", "DL", "rip", "Rip", "264", "265", "hevc", "HEVC",
      "avc", "AVC", "ac3", "AC3", "aac", "AAC", "dts", "DTS",
      "eac3", "EAC3", "flac", "FLAC", "opus", "OPUS", "pcm", "PCM",
      "truehd", "TrueHD", "atmos", "Atmos", "lpcm", "LPCM",
    ]);
    if (!falsePositives.has(group)) return group;
  }
  return null;
}

/* ── Codec detection ── */

const CODEC_MAP: Array<[RegExp, string]> = [
  [/\b(x\.?265|h\.?265|hevc)\b/i, "h265"],
  [/\b(x\.?264|h\.?264|avc)\b/i, "h264"],
  [/\bav1\b/i, "av1"],
  [/\bvp9\b/i, "vp9"],
  [/\bxvid\b/i, "xvid"],
  [/\bdivx\b/i, "divx"],
  [/\bmpeg-?2\b/i, "mpeg2"],
];

export function detectCodec(title: string): string | null {
  for (const [pattern, codec] of CODEC_MAP) {
    if (pattern.test(title)) return codec;
  }
  return null;
}

/* ── Audio codec detection ── */

const AUDIO_CODEC_MAP: Array<[RegExp, string]> = [
  // Order matters — most specific first
  [/\btruehd[.\s-]?atmos\b/i, "TrueHD Atmos"],
  [/\batmos\b/i, "TrueHD Atmos"],
  [/\btruehd\b/i, "TrueHD"],
  [/\bdts[.\s-]?hd[.\s-]?ma\b/i, "DTS-HD MA"],
  [/\bdts[.\s-]?hd\b/i, "DTS-HD"],
  [/\bdts\b/i, "DTS"],
  [/\b(eac3|e-ac-3|dd[p+]|ddp\d)\b/i, "EAC3"],
  [/\b(ac3|dd(?![p+]))\b/i, "AC3"],
  [/\bflac\b/i, "FLAC"],
  [/\bopus\b/i, "OPUS"],
  [/\baac\b/i, "AAC"],
  [/\b(lpcm|pcm)\b/i, "PCM"],
];

export function detectAudioCodec(title: string): string | null {
  for (const [pattern, codec] of AUDIO_CODEC_MAP) {
    if (pattern.test(title)) return codec;
  }
  return null;
}

/* ── HDR format detection ── */

const HDR_FORMAT_MAP: Array<[RegExp, string]> = [
  // Order matters — most specific first
  [/\b(dolby[.\s-]?vision|dv|dovi)\b/i, "DV"],
  [/\bhdr10(\+|plus)\b/i, "HDR10+"],
  [/\bhdr10\b/i, "HDR10"],
  [/\bhdr\b/i, "HDR"],
  [/\bhlg\b/i, "HLG"],
];

export function detectHdrFormat(title: string): string | null {
  for (const [pattern, format] of HDR_FORMAT_MAP) {
    if (pattern.test(title)) return format;
  }
  return null;
}

/* ── Audio channel detection ── */

export function detectAudioChannels(title: string): string | null {
  if (/\b7\.1\b/.test(title)) return "7.1";
  if (/\b5\.1\b/.test(title)) return "5.1";
  if (/\b(2\.0|stereo)\b/i.test(title)) return "2.0";
  if (/\b(1\.0|mono)\b/i.test(title)) return "1.0";
  return null;
}

/* ── Repack / Proper detection ── */

/**
 * Detect repack/proper count. Higher count means newer fix.
 * - "REPACK", "PROPER", "RERIP" → 1
 * - "REPACK2", "PROPER2"        → 2
 * - "REPACK3", "PROPER3"        → 3
 * Returns 0 if none.
 */
export function detectRepackCount(title: string): number {
  const match = /\b(?:repack|proper|rerip)(\d+)?\b/i.exec(title);
  if (!match) return 0;
  const n = match[1] ? parseInt(match[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/* ── Hybrid release detection ── */

export function isHybridRelease(title: string): boolean {
  return /\bhybrid\b/i.test(title);
}

/* ── Edition detection ── */

const EDITION_MAP: Array<[RegExp, string]> = [
  [/\bdirector'?s?[.\s-]?cut\b/i, "Director's Cut"],
  [/\bextended\b/i, "Extended"],
  [/\bremaster(ed)?\b/i, "Remastered"],
  [/\bunrated\b/i, "Unrated"],
  [/\buncut\b/i, "Uncut"],
  [/\btheatrical\b/i, "Theatrical"],
  [/\bimax\b/i, "IMAX"],
  [/\bcriterion\b/i, "Criterion"],
  [/\banniversary[.\s-]?edition\b/i, "Anniversary Edition"],
  [/\bcollector'?s?[.\s-]?edition\b/i, "Collector's Edition"],
  [/\bfinal[.\s-]?cut\b/i, "Final Cut"],
  [/\bspecial[.\s-]?edition\b/i, "Special Edition"],
];

export function detectEdition(title: string): string | null {
  for (const [pattern, edition] of EDITION_MAP) {
    if (pattern.test(title)) return edition;
  }
  return null;
}
