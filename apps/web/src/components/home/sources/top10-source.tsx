"use client";

import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { Top10Row } from "../top10-row";
import type { Top10Item } from "../top10-row";

interface Top10SourceProps {
  title: string;
  mediaType: "movie" | "show";
}

export function Top10Source({ title, mediaType }: Top10SourceProps): React.JSX.Element | null {
  const { region } = useWatchRegion();
  const { data, isLoading, isError } = trpc.provider.top10.useQuery(
    { region },
    { staleTime: 30 * 60 * 1000 },
  );

  if (isError) return null;

  const source = mediaType === "movie" ? data?.movies ?? [] : data?.shows ?? [];
  const items: Top10Item[] = source.map((r) => ({
    externalId: r.externalId,
    provider: r.provider,
    type: r.type,
    title: r.title,
    posterPath: r.posterPath,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  return <Top10Row title={title} items={items} isLoading={isLoading} />;
}
