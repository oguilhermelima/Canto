import { use } from "react";
import { redirect, notFound } from "next/navigation";

const REDIRECTS: Record<string, string> = {
  movies: "trending_movies",
  shows: "trending_shows",
};

export default function TypeIndexPage({
  params,
}: {
  params: Promise<{ type: string }>;
}): never {
  const { type } = use(params);
  const preset = REDIRECTS[type];
  if (!preset) notFound();
  redirect(`/discover?preset=${preset}`);
}
