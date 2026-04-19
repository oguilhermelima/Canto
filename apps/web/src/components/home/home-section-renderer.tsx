"use client";

import type { HomeSectionConfig } from "@canto/db/schema";
import { SpotlightSource } from "./sources/spotlight-source";
import { BrowseSource } from "./sources/browse-source";
import { RecommendationsSource } from "./sources/recommendations-source";
import { ContinueWatchingSource } from "./sources/continue-watching-source";
import { WatchNextSource } from "./sources/watch-next-source";
import { RecentlyAddedSource } from "./sources/recently-added-source";
import { CollectionSource } from "./sources/collection-source";
import { Top10Source } from "./sources/top10-source";
import { ProvidersRow } from "./providers-row";
import { GenresRow } from "./genres-row";

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
  const { id, title, style, sourceType, sourceKey, config } = section;

  if (sourceType === "db") {
    switch (sourceKey) {
      case "spotlight":
        return <SpotlightSource sectionId={id} title={title} style={style} />;
      case "recommendations":
        return <RecommendationsSource sectionId={id} title={title} style={style} />;
      case "continue_watching":
        return <ContinueWatchingSource sectionId={id} title={title} style={style} />;
      case "watch_next":
        return <WatchNextSource sectionId={id} title={title} style={style} />;
      case "recently_added":
        return <RecentlyAddedSource sectionId={id} title={title} style={style} />;
      case "collection": {
        const cfg = config as Record<string, unknown>;
        const listId = String(cfg?.listId || "");
        return listId ? <CollectionSource sectionId={id} title={title} style={style} listId={listId} /> : null;
      }
      case "watch_providers":
        return <ProvidersRow title={title} />;
      case "top10_movies":
        return <Top10Source title={title} mediaType="movie" />;
      case "top10_shows":
        return <Top10Source title={title} mediaType="show" />;
      case "genre_tiles":
        return <GenresRow title={title} />;
      default:
        return null;
    }
  }

  if (sourceType === "tmdb") {
    return <BrowseSource sectionId={id} title={title} style={style} config={config} />;
  }

  return null;
}
