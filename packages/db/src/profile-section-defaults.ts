import type { ProfileSectionConfig } from "./schema";

interface DefaultProfileSection {
  position: number;
  sectionKey: string;
  title: string;
  config: ProfileSectionConfig;
  enabled: boolean;
}

/** Canonical profile layout. Order matches the prescribed rendering in /profile/me. */
export const DEFAULT_PROFILE_SECTIONS: DefaultProfileSection[] = [
  { position: 0, sectionKey: "year_in_progress", title: "Year in progress", config: {}, enabled: true },
  { position: 1, sectionKey: "recent_completions", title: "Lately on screen", config: {}, enabled: true },
  { position: 2, sectionKey: "currently_watching", title: "Currently watching", config: {}, enabled: true },
  { position: 3, sectionKey: "top_favorites", title: "Hall of Fame", config: {}, enabled: true },
  { position: 4, sectionKey: "watchlist_launchpad", title: "On deck", config: {}, enabled: true },
  { position: 5, sectionKey: "recent_activity", title: "Recent diary", config: {}, enabled: true },
  { position: 6, sectionKey: "stats_dashboard", title: "Journey", config: {}, enabled: true },
  { position: 7, sectionKey: "taste_map", title: "Taste", config: {}, enabled: true },
  { position: 8, sectionKey: "insights", title: "Rating Voice", config: {}, enabled: true },
];

export const CANONICAL_SECTION_KEYS = new Set(
  DEFAULT_PROFILE_SECTIONS.map((s) => s.sectionKey),
);
