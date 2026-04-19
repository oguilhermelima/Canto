"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { StateMessage } from "@canto/ui/state-message";
import { cn } from "@canto/ui/cn";

function CollectionSection({
  list,
}: {
  list: { slug: string; name: string; itemCount: number; visibility: string };
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
      titleAction={
        list.visibility !== "public" ? (
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {list.visibility}
          </span>
        ) : undefined
      }
    />
  );
}

export function CollectionsTab(): React.JSX.Element {
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();
  const { data: layout } = trpc.list.getCollectionLayout.useQuery();
  const [showHidden, setShowHidden] = useState(false);

  const hiddenIds = useMemo(
    () => new Set(layout?.hiddenListIds ?? []),
    [layout?.hiddenListIds],
  );

  const allLists = lists ?? [];
  const hiddenCount = allLists.filter((l) => hiddenIds.has(l.id)).length;

  const visibleLists = useMemo(() => {
    if (showHidden) return allLists;
    return allLists.filter((l) => !hiddenIds.has(l.id));
  }, [allLists, hiddenIds, showHidden]);

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

  if (allLists.length === 0) {
    return <StateMessage preset="emptyCollections" />;
  }

  return (
    <>
      {hiddenCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              showHidden
                ? "bg-foreground text-background"
                : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
          </button>
        </div>
      )}

      <div className="-mx-5 flex flex-col gap-8 md:-mx-8 md:gap-12 lg:-mx-12 xl:-mx-16 2xl:-mx-24">
        {visibleLists.map((list) => (
          <CollectionSection key={list.id} list={list} />
        ))}
      </div>
    </>
  );
}
