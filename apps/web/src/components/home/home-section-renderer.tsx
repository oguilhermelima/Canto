"use client";

import type { HomeSectionConfig } from "@canto/db/schema";
import { SpotlightSource } from "./sources/spotlight-source";
import { BrowseSource } from "./sources/browse-source";
import { RecommendationsSource } from "./sources/recommendations-source";
import { ContinueWatchingSource } from "./sources/continue-watching-source";
import { WatchNextSource } from "./sources/watch-next-source";
import { RecentlyAddedSource } from "./sources/recently-added-source";
import { UserMediaSource } from "./sources/user-media-source";

interface HomeSectionRendererProps {
  section: {
    id: string;
    title: string;
    style: string;
    sourceType: string;
    sourceKey: string;
    config: HomeSectionConfig;
  };
}

export function HomeSectionRenderer({ section }: HomeSectionRendererProps): React.JSX.Element | null {
  const { title, style, sourceType, sourceKey, config } = section;

  if (sourceType === "db") {
    switch (sourceKey) {
      case "spotlight":
        return <SpotlightSource title={title} style={style} />;
      case "recommendations":
        return <RecommendationsSource title={title} style={style} />;
      case "continue_watching":
        return <ContinueWatchingSource title={title} style={style} />;
      case "watch_next":
        return <WatchNextSource title={title} style={style} />;
      case "recently_added":
        return <RecentlyAddedSource title={title} style={style} />;
      case "favorites":
        return <UserMediaSource title={title} style={style} filter={{ isFavorite: true }} />;
      case "planned":
        return <UserMediaSource title={title} style={style} filter={{ status: "planned" }} />;
      default:
        return null;
    }
  }

  if (sourceType === "tmdb") {
    return <BrowseSource title={title} style={style} config={config} />;
  }

  return null;
}
