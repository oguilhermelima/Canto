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
