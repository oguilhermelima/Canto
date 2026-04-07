export interface Preset {
  title: string;
  subtitle: string;
  type: "movie" | "show";
  mode?: "trending" | "discover";
  genres?: string;
  language?: string;
}

export const PRESETS: Record<string, Preset> = {
  trending_shows: {
    title: "Trending TV Shows",
    subtitle: "The most popular TV shows right now.",
    type: "show",
  },
  trending_movies: {
    title: "Trending Movies",
    subtitle: "The most popular movies right now.",
    type: "movie",
  },
  trending_anime: {
    title: "Trending Anime",
    subtitle: "The most popular anime series right now.",
    type: "show",
    genres: "16",
    language: "ja",
  },
  trending_anime_movies: {
    title: "Trending Anime Movies",
    subtitle: "The most popular anime movies right now.",
    type: "movie",
    mode: "discover",
    genres: "16",
    language: "ja",
  },
};

export const DEFAULT_PRESET = "trending_shows";
