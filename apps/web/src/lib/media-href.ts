/**
 * Build a URL for a media detail page.
 * TMDB media uses clean paths: /show/123, /movie/456
 * Other providers fall back to: /media/ext?provider=...&externalId=...&type=...
 */
export function mediaHref(provider: string, externalId: number | string, type: string): string {
  if (provider === "tmdb") {
    return `/${type === "show" ? "show" : "movie"}/${externalId}`;
  }
  return `/media/ext?provider=${provider}&externalId=${externalId}&type=${type}`;
}
