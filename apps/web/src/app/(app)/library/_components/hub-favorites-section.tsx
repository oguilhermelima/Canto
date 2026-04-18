"use client";

import { Heart } from "lucide-react";
import { HubUserMediaSection } from "./hub-user-media-section";

export function HubFavoritesSection(): React.JSX.Element {
  return (
    <HubUserMediaSection
      title="Favorites"
      icon={Heart}
      seeAllHref="/library/favorites"
      emptyPreset="emptyFavorites"
      queryInput={{ isFavorite: true, sortBy: "updatedAt", sortOrder: "desc" }}
    />
  );
}
