import { redirect } from "next/navigation";

export default function SeriesPage(): never {
  redirect("/discover?preset=trending_shows");
}
