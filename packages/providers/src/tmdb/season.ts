import type { NormalizedEpisode, NormalizedSeason } from "../types";

export function normalizeSeason(data: Record<string, unknown>): NormalizedSeason {
  const rawEpisodes = (data.episodes ?? []) as Array<Record<string, unknown>>;

  const episodes: NormalizedEpisode[] = rawEpisodes.map((ep) => {
    const rawCrew = (ep.crew ?? []) as Array<Record<string, unknown>>;
    const rawGuests = (ep.guest_stars ?? []) as Array<Record<string, unknown>>;

    return {
      number: ep.episode_number as number,
      externalId: ep.id as number,
      title: (ep.name as string) ?? undefined,
      overview: (ep.overview as string) ?? undefined,
      airDate: (ep.air_date as string | null) ?? undefined,
      runtime: (ep.runtime as number | null) ?? undefined,
      stillPath: (ep.still_path as string | null) ?? undefined,
      voteAverage: (ep.vote_average as number) ?? undefined,
      voteCount: (ep.vote_count as number) ?? undefined,
      episodeType: (ep.episode_type as string) ?? undefined,
      crew:
        rawCrew.length > 0
          ? rawCrew.map((c) => ({
              name: c.name as string,
              job: c.job as string,
              department: (c.department as string) ?? undefined,
              profilePath: (c.profile_path as string | null) ?? undefined,
            }))
          : undefined,
      guestStars:
        rawGuests.length > 0
          ? rawGuests.map((g) => ({
              name: g.name as string,
              character: (g.character as string) ?? undefined,
              profilePath: (g.profile_path as string | null) ?? undefined,
            }))
          : undefined,
    };
  });

  return {
    number: data.season_number as number,
    externalId: data.id as number,
    name: (data.name as string) ?? undefined,
    overview: (data.overview as string) ?? undefined,
    airDate: (data.air_date as string | null) ?? undefined,
    posterPath: (data.poster_path as string | null) ?? undefined,
    episodeCount: episodes.length,
    voteAverage: (data.vote_average as number) ?? undefined,
    episodes,
  };
}
