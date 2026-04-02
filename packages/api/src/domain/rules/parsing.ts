/** Matches S01E01, s1e5, etc. */
export const EP_PATTERN = /[Ss](\d{1,2})[Ee](\d{1,3})/;

/** Matches bare episode numbers like "- 01", "- 12" (common in anime fansubs) */
export const BARE_EP_PATTERN = /\s-\s(\d{2,3})(?:\s|\[|\.)/;

export function parseSeasons(title: string): number[] {
  const lower = title.toLowerCase();

  // S01E01 pattern -> single season
  const seMatch = /s(\d{1,2})e\d{1,3}/i.exec(lower);
  if (seMatch) return [parseInt(seMatch[1]!, 10)];

  // S01-S03 range
  const rangeMatch = /s(\d{1,2})\s*[-–]\s*s?(\d{1,2})/i.exec(lower);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]!, 10);
    const end = parseInt(rangeMatch[2]!, 10);
    if (start <= end) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    return [];
  }

  // S01 pack
  const packMatch = /\bs(\d{1,2})\b/i.exec(lower);
  if (packMatch) return [parseInt(packMatch[1]!, 10)];

  // "Season 1"
  const wordMatch = /\bseason\s*(\d{1,2})\b/i.exec(lower);
  if (wordMatch) return [parseInt(wordMatch[1]!, 10)];

  return [];
}

export function parseEpisodes(title: string): number[] {
  const lower = title.toLowerCase();

  // Multi-episode: S01E01E02E03
  const multiMatch = lower.match(/s\d{1,2}((?:e\d{1,3})+)/i);
  if (multiMatch) {
    const epPart = multiMatch[1]!;
    const eps = [...epPart.matchAll(/e(\d{1,3})/gi)].map((m) =>
      parseInt(m[1]!, 10),
    );
    if (eps.length > 1) return eps;
  }

  // Range: S01E01-E05 or S01E01-05
  const rangeMatch = /s\d{1,2}e(\d{1,3})\s*[-–]\s*e?(\d{1,3})/i.exec(lower);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]!, 10);
    const end = parseInt(rangeMatch[2]!, 10);
    if (end >= start) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  }

  // Single: S01E01
  const singleMatch = /s\d{1,2}e(\d{1,3})/i.exec(lower);
  if (singleMatch) return [parseInt(singleMatch[1]!, 10)];

  // No episode pattern = season pack
  return [];
}

/* ── Language detection ── */

const LANGUAGE_MAP: Record<string, string> = {
  multi: "multi", "multi-vf": "multi",
  dual: "dual", "dual.audio": "dual",
  english: "en", eng: "en",
  portuguese: "pt", "pt-br": "pt-br", "por": "pt", "brazilian": "pt-br",
  french: "fr", fra: "fr", vff: "fr", vostfr: "fr", truefrench: "fr",
  spanish: "es", spa: "es", latino: "es-la", castellano: "es",
  german: "de", ger: "de", deu: "de",
  italian: "it", ita: "it",
  japanese: "ja", jpn: "ja",
  korean: "ko", kor: "ko",
  chinese: "zh", chi: "zh", "zh-cn": "zh", "zh-tw": "zh-tw",
  russian: "ru", rus: "ru",
  arabic: "ar", ara: "ar",
  hindi: "hi", hin: "hi",
  turkish: "tr", tur: "tr",
  dutch: "nl", dut: "nl",
  polish: "pl", pol: "pl",
  swedish: "sv", swe: "sv",
  norwegian: "no", nor: "no",
  danish: "da", dan: "da",
  finnish: "fi", fin: "fi",
  czech: "cs", cze: "cs",
  hungarian: "hu", hun: "hu",
  romanian: "ro", rum: "ro",
  thai: "th", tha: "th",
  vietnamese: "vi", vie: "vi",
  indonesian: "id", ind: "id",
  malay: "ms", may: "ms",
};

export function detectLanguages(title: string): string[] {
  const lower = title.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();

  for (const [keyword, lang] of Object.entries(LANGUAGE_MAP)) {
    const pattern = new RegExp(`\\b${keyword.replace(/[.-]/g, "[.\\-]?")}\\b`, "i");
    if (pattern.test(lower) && !seen.has(lang)) {
      seen.add(lang);
      found.push(lang);
    }
  }

  return found;
}

/* ── Release group detection ── */

export function detectReleaseGroup(title: string): string | null {
  // Standard pattern: "-GroupName" at end (before optional extension)
  // e.g. "Movie.2024.1080p.WEB-DL.x265-FLUX" → "FLUX"
  // e.g. "Movie.2024.1080p.WEB-DL.x265-FLUX[rarbg]" → "FLUX"
  const match = /-([A-Za-z0-9]+)(?:\[.*\])?(?:\.\w{2,4})?$/.exec(title);
  if (match?.[1]) {
    const group = match[1];
    // Filter out common false positives (codecs, sources)
    const falsePositives = new Set([
      "dl", "DL", "rip", "Rip", "264", "265", "hevc", "HEVC",
      "avc", "AVC", "ac3", "AC3", "aac", "AAC", "dts", "DTS",
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

/* Subtitle helpers */

export const SUBTITLE_EXTENSIONS = new Set([
  ".srt",
  ".ass",
  ".sub",
  ".ssa",
  ".vtt",
]);

export function isSubtitleFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return SUBTITLE_EXTENSIONS.has(ext);
}

export function parseSubtitleLanguage(name: string): string | null {
  const match = /[.\s]([a-zA-Z]{2}(?:-[a-zA-Z]{2})?)\.[^.]+$/.exec(name);
  if (match?.[1]) {
    const lang = match[1];
    const known = [
      "en", "pt", "es", "fr", "de", "it", "ja", "ko", "zh", "ru", "ar", "hi",
      "pt-BR", "pt-PT", "zh-TW", "zh-CN",
    ];
    if (known.includes(lang)) return lang;
  }
  return null;
}
