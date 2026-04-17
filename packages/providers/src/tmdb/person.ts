import type { PersonCredit, PersonDetail } from "../types";
import { TmdbClient, yearFromDate } from "./client";

export async function getPerson(
  client: TmdbClient,
  personId: number,
): Promise<PersonDetail> {
  const data = await client.fetch<Record<string, unknown>>(
    `/person/${personId}`,
    { append_to_response: "combined_credits,images" },
  );

  const combinedCredits = (data.combined_credits ?? {}) as {
    cast?: unknown[];
  };

  const rawCast = (combinedCredits.cast ?? []) as Array<
    Record<string, unknown>
  >;

  const movieCredits: PersonCredit[] = [];
  const tvCredits: PersonCredit[] = [];

  for (const c of rawCast) {
    const mediaType = c.media_type as string;
    const isMovie = mediaType === "movie";
    const title = isMovie
      ? ((c.title as string) ?? "")
      : ((c.name as string) ?? "");
    const releaseDate = isMovie
      ? ((c.release_date as string) ?? undefined)
      : ((c.first_air_date as string) ?? undefined);

    const credit: PersonCredit = {
      id: c.id as number,
      title,
      character: (c.character as string) ?? undefined,
      posterPath: (c.poster_path as string | null) ?? undefined,
      backdropPath: (c.backdrop_path as string | null) ?? undefined,
      releaseDate,
      year: yearFromDate(releaseDate),
      voteAverage: (c.vote_average as number) ?? undefined,
      mediaType: isMovie ? "movie" : "show",
    };

    if (isMovie) {
      movieCredits.push(credit);
    } else if (mediaType === "tv") {
      tvCredits.push(credit);
    }
  }

  // Sort by popularity (vote_average * vote_count approximation via popularity) descending
  const sortByPopularity = (a: PersonCredit, b: PersonCredit): number =>
    (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
  movieCredits.sort(sortByPopularity);
  tvCredits.sort(sortByPopularity);

  const rawImages = data.images as { profiles?: unknown[] } | undefined;
  const images = (
    (rawImages?.profiles ?? []) as Array<Record<string, unknown>>
  ).map((img) => ({
    filePath: img.file_path as string,
    aspectRatio: (img.aspect_ratio as number) ?? 0.667,
  }));

  return {
    id: data.id as number,
    name: (data.name as string) ?? "",
    biography: (data.biography as string) ?? "",
    birthday: (data.birthday as string | null) ?? null,
    deathday: (data.deathday as string | null) ?? null,
    placeOfBirth: (data.place_of_birth as string | null) ?? null,
    profilePath: (data.profile_path as string | null) ?? null,
    knownForDepartment: (data.known_for_department as string | null) ?? null,
    alsoKnownAs: (data.also_known_as as string[]) ?? [],
    gender: (data.gender as number) ?? 0,
    popularity: (data.popularity as number) ?? 0,
    images,
    movieCredits,
    tvCredits,
  };
}
