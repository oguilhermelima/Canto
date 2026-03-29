import { redirect } from "next/navigation";

export default function AnimeMoviesPage(): never {
  redirect("/discover?preset=trending_anime_movies");
}
