"use client";

import { useMemo } from "react";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { StateMessage } from "~/components/layout/state-message";

function CollectionSection({
  list,
}: {
  list: { slug: string; name: string; itemCount: number };
}): React.JSX.Element | null {
  const { data, isLoading } = trpc.list.getBySlug.useQuery(
    { slug: list.slug, limit: 20 },
    { enabled: list.itemCount > 0 },
  );

  const items = useMemo(
    () =>
      (data?.items ?? []).map((row) => ({
        id: row.media.id,
        externalId: String(row.media.externalId),
        provider: row.media.provider,
        type: row.media.type as "movie" | "show",
        title: row.media.title,
        posterPath: row.media.posterPath,
        year: row.media.year ?? undefined,
        voteAverage: row.media.voteAverage ?? undefined,
      })),
    [data],
  );

  if (list.itemCount === 0) return null;

  return (
    <MediaCarousel
      title={list.name}
      seeAllHref={`/collection/${list.slug}`}
      items={items}
      isLoading={isLoading}
      hideable={false}
    />
  );
}

export function CollectionsTab(): React.JSX.Element {
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();

  const publicLists = useMemo(
    () => (lists ?? []).filter((l) => l.visibility === "public"),
    [lists],
  );

  if (isError) {
    return <StateMessage preset="error" onRetry={() => void refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="-mx-5 flex flex-col gap-8 md:-mx-8 md:gap-12 lg:-mx-12 xl:-mx-16 2xl:-mx-24">
        {Array.from({ length: 3 }).map((_, i) => (
          <MediaCarousel key={i} title="" items={[]} isLoading />
        ))}
      </div>
    );
  }

  if (publicLists.length === 0) {
    return <StateMessage preset="emptyCollections" />;
  }

  return (
    <div className="-mx-5 flex flex-col gap-8 md:-mx-8 md:gap-12 lg:-mx-12 xl:-mx-16 2xl:-mx-24">
      {publicLists.map((list) => (
        <CollectionSection key={list.id} list={list} />
      ))}
    </div>
  );
}
