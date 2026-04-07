import { use } from "react";
import { redirect, notFound } from "next/navigation";

const REDIRECTS: Record<string, string> = {
  movies: "movie",
  shows: "show",
};

export default function TypeIndexPage({
  params,
}: {
  params: Promise<{ type: string }>;
}): never {
  const { type } = use(params);
  const searchType = REDIRECTS[type];
  if (!searchType) notFound();
  redirect(`/search?type=${searchType}`);
}
