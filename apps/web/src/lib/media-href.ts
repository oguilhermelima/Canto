/**
 * Build a URL for a media detail page from provider metadata.
 * Always produces clean paths: /movies/123, /shows/456
 */
export function mediaHref(provider: string, externalId: number | string, type: string): string {
  return `/${type === "show" ? "shows" : "movies"}/${externalId}`;
}

/**
 * Build a URL for a media detail page from a DB row.
 * DB rows always have externalId + type.
 */
export function mediaDetailHref(media: { type: string; externalId: number }): string {
  return `/${media.type === "show" ? "shows" : "movies"}/${media.externalId}`;
}
