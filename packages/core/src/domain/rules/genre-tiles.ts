/**
 * Curated genre tile list with brand colors, used by the discover rail.
 * `movieId` is the TMDB genre id.
 */
export const GENRE_TILE_LIST: ReadonlyArray<{ name: string; movieId: number; color: string }> = [
  { name: "Action",       movieId: 28,    color: "#7c3aed" },
  { name: "Adventure",    movieId: 12,    color: "#16a34a" },
  { name: "Animation",    movieId: 16,    color: "#0ea5e9" },
  { name: "Comedy",       movieId: 35,    color: "#ca8a04" },
  { name: "Crime",        movieId: 80,    color: "#1d4ed8" },
  { name: "Documentary",  movieId: 99,    color: "#0f766e" },
  { name: "Drama",        movieId: 18,    color: "#be123c" },
  { name: "Fantasy",      movieId: 14,    color: "#9333ea" },
  { name: "Horror",       movieId: 27,    color: "#1f2937" },
  { name: "Mystery",      movieId: 9648,  color: "#4338ca" },
  { name: "Romance",      movieId: 10749, color: "#db2777" },
  { name: "Sci-Fi",       movieId: 878,   color: "#6d28d9" },
  { name: "Thriller",     movieId: 53,    color: "#b45309" },
];
