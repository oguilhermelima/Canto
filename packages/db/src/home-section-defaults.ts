import type { HomeSectionConfig } from "./schema";

interface DefaultSection {
  position: number;
  title: string;
  style: string;
  sourceType: string;
  sourceKey: string;
  config: HomeSectionConfig;
  enabled: boolean;
}

export const DEFAULT_HOME_SECTIONS: DefaultSection[] = [
  {
    position: 0,
    title: "Spotlight",
    style: "spotlight",
    sourceType: "db",
    sourceKey: "spotlight",
    config: {},
    enabled: true,
  },
  {
    position: 1,
    title: "Continue Watching",
    style: "large_video",
    sourceType: "db",
    sourceKey: "continue_watching",
    config: {},
    enabled: true,
  },
  {
    position: 2,
    title: "Recently Added",
    style: "cover",
    sourceType: "db",
    sourceKey: "recently_added",
    config: {},
    enabled: true,
  },
  {
    position: 3,
    title: "Recommended for you",
    style: "large_video",
    sourceType: "db",
    sourceKey: "recommendations",
    config: {},
    enabled: true,
  },
  {
    position: 4,
    title: "Trending TV Shows",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "trending",
    config: { type: "show" },
    enabled: true,
  },
  {
    position: 5,
    title: "Action & Adventure Series",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "discover",
    config: { type: "show", mode: "discover", genres: "10759" },
    enabled: true,
  },
  {
    position: 6,
    title: "Trending Movies",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "trending",
    config: { type: "movie" },
    enabled: true,
  },
  {
    position: 7,
    title: "Sci-Fi & Fantasy",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "discover",
    config: { type: "show", mode: "discover", genres: "10765" },
    enabled: true,
  },
  {
    position: 8,
    title: "Trending Anime",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "trending",
    config: { type: "show", genres: "16", language: "ja" },
    enabled: true,
  },
  {
    position: 9,
    title: "Thriller Movies",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "discover",
    config: { type: "movie", mode: "discover", genres: "53" },
    enabled: true,
  },
  {
    position: 10,
    title: "Trending Anime Movies",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "discover",
    config: { type: "movie", mode: "discover", genres: "16", language: "ja" },
    enabled: true,
  },
  {
    position: 11,
    title: "Crime & Mystery",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "discover",
    config: { type: "show", mode: "discover", genres: "80" },
    enabled: true,
  },
  {
    position: 12,
    title: "Drama Series",
    style: "card",
    sourceType: "tmdb",
    sourceKey: "discover",
    config: { type: "show", mode: "discover", genres: "18" },
    enabled: true,
  },
];
