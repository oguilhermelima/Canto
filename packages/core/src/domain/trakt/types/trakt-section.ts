/**
 * Trakt sync sections — the eight surfaces the coordinator dispatches over.
 *
 * The coordinator lists `last_activities` once per connection and uses each
 * section's last-activity timestamp to decide whether to enqueue a section
 * job. Some are pull-only ("watched-*", "playback") and some are push-bearing
 * ("history", "watchlist", "ratings", "favorites", "lists").
 */
export type TraktSection =
  | "watched-movies"
  | "watched-shows"
  | "history"
  | "watchlist"
  | "ratings"
  | "favorites"
  | "lists"
  | "playback";
