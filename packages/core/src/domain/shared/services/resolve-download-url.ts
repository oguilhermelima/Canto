/**
 * Follow HTTP redirects to resolve the final download URL.
 * Many private trackers return URLs that redirect 2-3 times before
 * reaching the actual .torrent file or magnet link.
 *
 * Returns the original URL if resolution fails (graceful fallback).
 */
export async function resolveDownloadUrl(
  url: string,
  maxRedirects = 10,
): Promise<string> {
  if (url.startsWith("magnet:")) return url;

  let current = url;

  try {
    for (let i = 0; i < maxRedirects; i++) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "application/x-bittorrent, */*" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;

        current =
          location.startsWith("http") || location.startsWith("magnet:")
            ? location
            : new URL(location, current).toString();

        if (current.startsWith("magnet:")) return current;

        continue;
      }

      return current;
    }
  } catch {
    // Network error — fall back to original URL
  }

  return url;
}
