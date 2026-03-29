import { redirect } from "next/navigation";

export default function AnimesPage(): never {
  redirect("/discover?preset=trending_anime");
}
