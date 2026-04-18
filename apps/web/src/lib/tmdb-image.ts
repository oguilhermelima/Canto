import type { ImageLoaderProps } from "next/image";

/**
 * TMDB image sizes available for posters.
 * Picks the smallest TMDB size that covers the requested width.
 */
const POSTER_SIZES = [
  { max: 154, size: "w154" },
  { max: 185, size: "w185" },
  { max: 342, size: "w342" },
  { max: 500, size: "w500" },
  { max: 780, size: "w780" },
] as const;

const BACKDROP_SIZES = [
  { max: 300, size: "w300" },
  { max: 780, size: "w780" },
  { max: 1280, size: "w1280" },
] as const;

const BACKDROP_THUMB_SIZES = [
  { max: 400, size: "w300" },
  { max: 1_000_000, size: "w780" },
] as const;

function pickSize(width: number, sizes: readonly { max: number; size: string }[]): string {
  for (const s of sizes) {
    if (width <= s.max) return s.size;
  }
  return "original";
}

/** Next.js Image loader that resolves TMDB poster paths to the right CDN size. */
export function tmdbPosterLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith("http")) return src;
  return `https://image.tmdb.org/t/p/${pickSize(width, POSTER_SIZES)}${src}`;
}

/** Next.js Image loader for TMDB backdrops / stills. */
export function tmdbBackdropLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith("http")) return src;
  return `https://image.tmdb.org/t/p/${pickSize(width, BACKDROP_SIZES)}${src}`;
}

/**
 * Next.js Image loader for small backdrop thumbnails (card grids).
 * Caps at w780 — retina cards avoid w1280 payloads.
 */
export function tmdbThumbLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith("http")) return src;
  return `https://image.tmdb.org/t/p/${pickSize(width, BACKDROP_THUMB_SIZES)}${src}`;
}
