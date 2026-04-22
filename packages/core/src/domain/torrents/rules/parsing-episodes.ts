/* ── Directory name parsing (folder scan) ── */

/**
 * Parse a media directory name to extract title, year, and external IDs.
 *
 * Supports patterns like:
 * - `Movie Name (2024) [tmdbid-12345]`
 * - `Show Name (2020) [tmdb-67890]`
 * - `Movie Name (2024) {imdb-tt1234567}`
 * - `Movie Name (2024)`
 */
export function parseFolderMediaInfo(dirName: string): {
  title: string;
  year?: number;
  tmdbId?: number;
  imdbId?: string;
} | null {
  let tmdbId: number | undefined;
  let imdbId: string | undefined;

  // Match [tmdbid-123] or [tmdb-123]
  const tmdbMatch = /\[tmdb(?:id)?-(\d+)\]/i.exec(dirName);
  if (tmdbMatch) {
    tmdbId = parseInt(tmdbMatch[1]!, 10);
  }

  // Match {imdb-tt1234567} or [imdbid-tt1234567]
  const imdbMatch = /[{[]imdb(?:id)?-(tt\d+)[}\]]/i.exec(dirName);
  if (imdbMatch) {
    imdbId = imdbMatch[1]!;
  }

  // Match title (year)
  const titleYearMatch = /^(.+?)\s*\((\d{4})\)/.exec(dirName);
  if (titleYearMatch) {
    return {
      title: titleYearMatch[1]!.trim(),
      year: parseInt(titleYearMatch[2]!, 10),
      tmdbId,
      imdbId,
    };
  }

  // If we have an external ID but no title+year pattern, try to use the whole name as title
  if (tmdbId || imdbId) {
    // Strip known tags to get the title
    const cleaned = dirName
      .replace(/\[tmdb(?:id)?-\d+\]/gi, "")
      .replace(/[{[]imdb(?:id)?-tt\d+[}\]]/gi, "")
      .trim();
    if (cleaned.length > 0) {
      return { title: cleaned, tmdbId, imdbId };
    }
  }

  return null;
}

/** Matches S01E01, s1e5, etc. */
export const EP_PATTERN = /[Ss](\d{1,2})[Ee](\d{1,3})/;

/** Matches bare episode numbers like "- 01", "- 12" (common in anime fansubs) */
export const BARE_EP_PATTERN = /\s-\s(\d{2,3})(?:\s|\[|\.)/;

/**
 * Parse ALL episode numbers from a filename (handles multi-episode patterns).
 * Returns `{ season, episodes }` where episodes may have multiple entries.
 *
 * Patterns supported:
 * - `S01E01E02E03` → { season: 1, episodes: [1, 2, 3] }
 * - `S01E01-E05`   → { season: 1, episodes: [1, 2, 3, 4, 5] }
 * - `S01E01-03`    → { season: 1, episodes: [1, 2, 3] }
 * - `S01E01`       → { season: 1, episodes: [1] }
 * - `- 05`         → { season: undefined, episodes: [5] }
 */
export function parseFileEpisodes(filename: string): { season: number | undefined; episodes: number[] } {
  // Multi-episode: S01E01E02E03
  const multiMatch = filename.match(/[Ss](\d{1,2})((?:[Ee]\d{1,3}){2,})/);
  if (multiMatch) {
    const season = parseInt(multiMatch[1]!, 10);
    const eps = [...multiMatch[2]!.matchAll(/[Ee](\d{1,3})/g)].map((m) => parseInt(m[1]!, 10));
    return { season, episodes: eps };
  }

  // Range: S01E01-E05 or S01E01-05
  const rangeMatch = /[Ss](\d{1,2})[Ee](\d{1,3})\s*[-–]\s*[Ee]?(\d{1,3})/.exec(filename);
  if (rangeMatch) {
    const season = parseInt(rangeMatch[1]!, 10);
    const start = parseInt(rangeMatch[2]!, 10);
    const end = parseInt(rangeMatch[3]!, 10);
    if (end >= start) {
      return { season, episodes: Array.from({ length: end - start + 1 }, (_, i) => start + i) };
    }
  }

  // Single: S01E01
  const singleMatch = EP_PATTERN.exec(filename);
  if (singleMatch) {
    return { season: parseInt(singleMatch[1]!, 10), episodes: [parseInt(singleMatch[2]!, 10)] };
  }

  // Bare episode: - 05
  const bareMatch = BARE_EP_PATTERN.exec(filename);
  if (bareMatch) {
    return { season: undefined, episodes: [parseInt(bareMatch[1]!, 10)] };
  }

  return { season: undefined, episodes: [] };
}

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
