"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { StateMessage } from "~/components/layout/state-message";

interface LayoutPreferences {
  hiddenIds: string[];
  orderedIds: string[];
}

function applyManualOrder<T extends { id: string }>(
  items: T[],
  orderedIds: string[],
): T[] {
  if (orderedIds.length === 0) return items;
  const itemMap = new Map(items.map((item) => [item.id, item] as const));
  const ordered = orderedIds
    .map((id) => itemMap.get(id))
    .filter((item): item is T => !!item);
  const rest = items.filter((item) => !orderedIds.includes(item.id));
  return [...ordered, ...rest];
}

function CollectionSection({
  slug,
  name,
  itemCount,
}: {
  slug: string;
  name: string;
  itemCount: number;
}): React.JSX.Element | null {
  const { data, isLoading } = trpc.list.getBySlug.useQuery(
    { slug, limit: 20 },
    { enabled: itemCount > 0 },
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

  if (itemCount === 0) return null;

  return (
    <MediaCarousel
      title={name}
      seeAllHref={`/collection/${slug}`}
      items={items}
      isLoading={isLoading}
    />
  );
}

export function CollectionsSectionsView({
  onCreateCollection,
}: {
  onCreateCollection: () => void;
}): React.JSX.Element {
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();
  const layoutQuery = trpc.list.getCollectionLayout.useQuery();

  const layout = useMemo<LayoutPreferences>(() => {
    if (!layoutQuery.data) return { hiddenIds: [], orderedIds: [] };
    return {
      hiddenIds: layoutQuery.data.hiddenListIds,
      orderedIds: layoutQuery.data.orderedListIds,
    };
  }, [layoutQuery.data]);

  const allLists = useMemo(() => lists ?? [], [lists]);

  const visibleLists = useMemo(() => {
    const hiddenSet = new Set(layout.hiddenIds);
    const visible = allLists.filter((list) => !hiddenSet.has(list.id));
    return applyManualOrder(visible, layout.orderedIds);
  }, [allLists, layout]);

  if (isLoading || layoutQuery.isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <MediaCarousel
            key={i}
            title=""
            items={[]}
            isLoading
          />
        ))}
      </div>
    );
  }

  if (isError || layoutQuery.isError) {
    return (
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <StateMessage
          preset="error"
          onRetry={() => {
            void refetch();
            void layoutQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (visibleLists.length === 0) {
    return (
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <StateMessage
          preset="emptyCollections"
          action={{ label: "New Collection", onClick: onCreateCollection }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:gap-12">
      {visibleLists.map((list) => (
        <CollectionSection
          key={list.id}
          slug={list.slug}
          name={list.name}
          itemCount={list.itemCount}
        />
      ))}

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <button
          type="button"
          onClick={onCreateCollection}
          className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 transition-colors hover:border-foreground/20 hover:bg-muted/40"
        >
          <Plus className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            New Collection
          </span>
        </button>
      </div>
    </div>
  );
}
