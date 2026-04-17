export function buildFallbackMagnet(hash: string, title: string): string {
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`;
}
