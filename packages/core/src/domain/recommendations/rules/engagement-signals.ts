export interface EngagementSignal {
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
}

/**
 * Multiplier applied to a seed's sourceWeight when the user has shown
 * positive engagement with that media. Returns 1.0 (no boost) when the
 * signal is neutral or absent.
 *
 * Rating scale is 1-10 (see validators/user-media-tracking).
 *
 * Layered: takes the max of every applicable bucket so a 10/10 favorite
 * doesn't get capped at the "completed" multiplier.
 */
export function engagementMultiplier(signal: EngagementSignal): number {
  let multiplier = 1.0;
  if (signal.isFavorite) multiplier = Math.max(multiplier, 1.6);
  if (signal.status === "completed") multiplier = Math.max(multiplier, 1.5);
  if (signal.status === "watching") multiplier = Math.max(multiplier, 1.2);
  if (signal.rating !== null) {
    if (signal.rating >= 8) multiplier = Math.max(multiplier, 1.8);
    else if (signal.rating >= 6) multiplier = Math.max(multiplier, 1.3);
  }
  return multiplier;
}

/**
 * Drop and rating ≤ 3 are negative signals: the user explicitly disliked
 * the media. Such mediaIds must never appear in recommendations and are
 * not valid seed sources.
 */
export function isNegativeSignal(signal: EngagementSignal): boolean {
  if (signal.status === "dropped") return true;
  if (signal.rating !== null && signal.rating <= 3) return true;
  return false;
}
