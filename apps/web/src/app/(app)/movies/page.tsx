import { redirect } from "next/navigation";

export default function MoviesPage(): never {
  redirect("/discover?preset=trending_movies");
}
