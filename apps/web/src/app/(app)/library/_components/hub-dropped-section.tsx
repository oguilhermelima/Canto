"use client";

import { XCircle } from "lucide-react";
import { HubUserMediaSection } from "./hub-user-media-section";

export function HubDroppedSection(): React.JSX.Element {
  return (
    <HubUserMediaSection
      title="Dropped"
      icon={XCircle}
      seeAllHref="/library/dropped"
      emptyPreset="emptyDropped"
      queryInput={{ status: "dropped", sortBy: "updatedAt", sortOrder: "desc" }}
    />
  );
}
