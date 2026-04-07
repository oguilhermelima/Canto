/* -------------------------------------------------------------------------- */
/*  Pure functions for RSS title matching                                      */
/* -------------------------------------------------------------------------- */

interface MonitoredShow {
  id: string;
  title: string;
  externalId: number;
  provider: string;
  type: string;
}

/**
 * Build a title lookup map from monitored shows.
 * Keys are lowercase titles.
 */
export function buildTitleMap<T extends MonitoredShow>(shows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const show of shows) {
    map.set(show.title.toLowerCase(), show);
  }
  return map;
}

/**
 * Match an RSS item title against monitored shows by checking if
 * the show title appears in the RSS title (word or dot-separated).
 */
export function matchRssTitle<T extends MonitoredShow>(
  rssTitle: string,
  monitoredShows: T[],
): T | undefined {
  const lowerTitle = rssTitle.toLowerCase();

  for (const show of monitoredShows) {
    const showWords = show.title.toLowerCase().replace(/[^\w\s]/g, "");
    if (lowerTitle.includes(showWords) || lowerTitle.includes(showWords.replace(/\s+/g, "."))) {
      return show;
    }
  }

  return undefined;
}
