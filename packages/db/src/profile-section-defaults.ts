import type { ProfileSectionConfig } from "./schema";

interface DefaultProfileSection {
  position: number;
  sectionKey: string;
  title: string;
  config: ProfileSectionConfig;
  enabled: boolean;
}

export const DEFAULT_PROFILE_SECTIONS: DefaultProfileSection[] = [
  // The story: journey → favorites → watching → taste → rating voice → verdicts → activity
  { position: 0, sectionKey: "stats_dashboard", title: "Journey", config: {}, enabled: true },
  { position: 1, sectionKey: "top_favorites", title: "Hall of Fame", config: {}, enabled: true },
  { position: 2, sectionKey: "currently_watching", title: "Currently Watching", config: {}, enabled: true },
  { position: 3, sectionKey: "taste_map", title: "Taste", config: {}, enabled: true },
  { position: 4, sectionKey: "insights", title: "Rating Voice", config: {}, enabled: true },
  { position: 5, sectionKey: "recent_ratings", title: "Recent Ratings", config: {}, enabled: true },
  { position: 6, sectionKey: "recent_activity", title: "Recent Activity", config: {}, enabled: true },
  { position: 7, sectionKey: "watchlist_launchpad", title: "Launchpad", config: {}, enabled: false },
  { position: 8, sectionKey: "dropped_ships", title: "Dropped Ships", config: {}, enabled: false },
];
