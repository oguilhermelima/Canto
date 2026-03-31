import type { Database } from "./client";
import { genre } from "./schema";

const GENRES = [
  { name: "Action", tmdbQuery: "with_genres=10759", tvdbQuery: "genre=1" },
  { name: "Adventure", tmdbQuery: "with_genres=10759", tvdbQuery: "genre=2" },
  { name: "Animation", tmdbQuery: "with_genres=16", tvdbQuery: "genre=3" },
  {
    name: "Anime",
    tmdbQuery: "with_genres=16&with_original_language=ja",
    tvdbQuery: "genre=4",
  },
  { name: "Children", tmdbQuery: "with_genres=10762", tvdbQuery: "genre=5" },
  { name: "Comedy", tmdbQuery: "with_genres=35", tvdbQuery: "genre=7" },
  { name: "Crime", tmdbQuery: "with_genres=80", tvdbQuery: "genre=8" },
  { name: "Documentary", tmdbQuery: "with_genres=99", tvdbQuery: "genre=9" },
  { name: "Drama", tmdbQuery: "with_genres=18", tvdbQuery: "genre=10" },
  { name: "Family", tmdbQuery: "with_genres=10751", tvdbQuery: "genre=11" },
  { name: "Fantasy", tmdbQuery: "with_genres=10765", tvdbQuery: "genre=12" },
  { name: "Horror", tmdbQuery: "with_keywords=315058", tvdbQuery: "genre=26" },
  {
    name: "Martial Arts",
    tmdbQuery: "with_keywords=779",
    tvdbQuery: "genre=19",
  },
  { name: "Mini-Series", tmdbQuery: "with_type=2", tvdbQuery: "genre=21" },
  { name: "Musical", tmdbQuery: "with_keywords=4344", tvdbQuery: "genre=22" },
  { name: "Mystery", tmdbQuery: "with_genres=9648", tvdbQuery: "genre=23" },
  { name: "News", tmdbQuery: "with_genres=10763", tvdbQuery: "genre=24" },
  { name: "Reality", tmdbQuery: "with_genres=10764", tvdbQuery: "genre=27" },
  { name: "Romance", tmdbQuery: "with_keywords=9840", tvdbQuery: "genre=28" },
  { name: "Sci-Fi", tmdbQuery: "with_genres=10765", tvdbQuery: "genre=29" },
  { name: "Soap", tmdbQuery: "with_genres=10766", tvdbQuery: "genre=30" },
  { name: "Sport", tmdbQuery: "with_keywords=6075", tvdbQuery: "genre=31" },
  { name: "Talk Show", tmdbQuery: "with_genres=10767", tvdbQuery: "genre=33" },
  {
    name: "Thriller",
    tmdbQuery: "with_keywords=316362",
    tvdbQuery: "genre=34",
  },
  { name: "War", tmdbQuery: "with_genres=10768", tvdbQuery: "genre=35" },
  { name: "Western", tmdbQuery: "with_genres=37", tvdbQuery: "genre=36" },
];

export async function seedGenres(db: Database): Promise<void> {
  const existing = await db.query.genre.findMany();
  if (existing.length > 0) return;

  await db.insert(genre).values(GENRES);
  console.log(`[seed] Inserted ${GENRES.length} genres`);
}
