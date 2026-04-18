"use client";

import { Star } from "lucide-react";
import { HubUserMediaSection } from "./hub-user-media-section";

export function HubRatingsSection(): React.JSX.Element {
  return (
    <HubUserMediaSection
      title="Your Ratings"
      icon={Star}
      seeAllHref="/library/ratings"
      emptyPreset="emptyRatings"
      queryInput={{ hasRating: true, sortBy: "rating", sortOrder: "desc" }}
      showUserRating
    />
  );
}
