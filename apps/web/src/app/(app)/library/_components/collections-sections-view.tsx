"use client";

import { useMemo } from "react";
import { cn } from "@canto/ui/cn";
import { Plus } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { StateMessage } from "~/components/layout/state-message";

interface ListInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  visibility: string;
  itemCount: number;
}

function CollectionSection({
  list,
  isHidden,
}: {
  list: ListInfo;
  isHidden: boolean;
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
    <div className={cn(isHidden && "opacity-50")}>
      <MediaCarousel
        title={list.name}
        seeAllHref={`/collection/${list.slug}`}
        items={items}
        isLoading={isLoading}
        hideable={false}
      />
    </div>
  );
}

export function CollectionsSectionsView({
  showHidden = false,
  onCreateCollection,
}: {
  showHidden?: boolean;
  onCreateCollection: () => void;
}): React.JSX.Element {
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();
  const layoutQuery = trpc.list.getCollectionLayout.useQuery();

  const hiddenIds = layoutQuery.data?.hiddenListIds ?? [];
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  // DB returns lists in position order — use directly
  const visibleLists = useMemo(() => {
    const all = lists ?? [];
    return showHidden
      ? all
      : all.filter((list) => !hiddenSet.has(list.id));
  }, [lists, showHidden, hiddenSet]);

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
          list={list}
          isHidden={hiddenSet.has(list.id)}
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
