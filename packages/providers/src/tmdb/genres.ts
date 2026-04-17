import type { MediaType } from "../types";
import type { TmdbClient } from "./client";

export async function getGenres(
  client: TmdbClient,
  type: MediaType,
): Promise<Array<{ id: number; name: string }>> {
  const endpoint = type === "movie" ? "/genre/movie/list" : "/genre/tv/list";
  const data = await client.fetch<{
    genres: Array<{ id: number; name: string }>;
  }>(endpoint);
  return data.genres;
}
