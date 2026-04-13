"use client";

import type { ProfileSectionConfig } from "@canto/db/schema";
import type { ProfileStoryData } from "./use-profile-story";

// Narrative blocks
import { JourneyOpener, TasteNarrative, RatingVoice } from "./sections/narrative-journey";

// Media carousel blocks
import { TopFavoritesBlock } from "./sections/top-favorites";
import { CurrentlyWatchingBlock } from "./sections/currently-watching";
import { RecentRatingsBlock } from "./sections/recent-ratings";
import { WatchlistLaunchpadBlock } from "./sections/watchlist-launchpad";
import { RecentActivityBlock } from "./sections/recent-activity";
import { DroppedShipsBlock } from "./sections/dropped-ships";

interface ProfileSectionRendererProps {
  section: {
    id: string;
    sectionKey: string;
    title: string;
    config: ProfileSectionConfig;
  };
  story: ProfileStoryData;
}

export function ProfileSectionRenderer({ section, story }: ProfileSectionRendererProps): React.JSX.Element | null {
  switch (section.sectionKey) {
    // Narrative prose blocks
    case "stats_dashboard":
    case "total_screen_time":
      return <JourneyOpener {...story} />;
    case "taste_map":
    case "genre_dna":
      return <TasteNarrative {...story} />;
    case "insights":
    case "rating_personality":
      return <RatingVoice {...story} />;

    // Media carousels (self-contained, own data)
    case "top_favorites": return <TopFavoritesBlock title={section.title} />;
    case "currently_watching": return <CurrentlyWatchingBlock title={section.title} />;
    case "recent_ratings": return <RecentRatingsBlock title={section.title} />;
    case "watchlist_launchpad": return <WatchlistLaunchpadBlock title={section.title} />;
    case "recent_activity": return <RecentActivityBlock title={section.title} />;
    case "dropped_ships": return <DroppedShipsBlock title={section.title} />;

    default: return null;
  }
}
