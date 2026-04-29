"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FolderHeart } from "lucide-react";
import { SectionTitle } from "@canto/ui/section-title";
import { trpc } from "@/lib/trpc/client";
import { CollectionCard } from "@/components/media/cards/collection-card";
import { NewCollectionCard } from "@/components/media/cards/new-collection-card";

export { CollectionCard } from "@/components/media/cards/collection-card";
export { NewCollectionCard } from "@/components/media/cards/new-collection-card";

export function HubCollectionsSection(): React.JSX.Element {
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();
  const layoutQuery = trpc.list.getCollectionLayout.useQuery();

  // Show only user-created collections on the /library hub. Watchlist +
  // Server Library get their own dedicated sections above.
  const visibleLists = useMemo(() => {
    const hiddenSet = new Set(layoutQuery.data?.hiddenListIds ?? []);
    return (lists ?? []).filter(
      (l) => l.type === "custom" && !hiddenSet.has(l.id),
    );
  }, [lists, layoutQuery.data]);

  if (isLoading || layoutQuery.isLoading) {
    return (
      <section className="relative">
        <SectionTitle title="Collections" icon={FolderHeart} seeMorePath="/library/collections" linkAs={Link} />
        <div className="flex gap-3 overflow-x-auto overflow-y-visible pb-4 pl-4 scrollbar-none md:gap-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[16/9] w-[300px] shrink-0 animate-pulse rounded-2xl bg-muted sm:w-[340px] lg:w-[380px] 2xl:w-[420px]"
            />
          ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            Failed to load your collections.
          </p>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-foreground hover:text-foreground"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (visibleLists.length === 0) {
    return (
      <section>
        <SectionTitle title="Collections" icon={FolderHeart} />
        <div className="rounded-2xl px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 border border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          No collections yet. Launch your first collection to organize your galaxy of titles.
        </div>
      </section>
    );
  }

  return (
    <section className="relative">
      <SectionTitle title="Collections" icon={FolderHeart} seeMorePath="/library/collections" linkAs={Link} />

      <div className="flex gap-4 overflow-x-auto overflow-y-visible pb-4 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {visibleLists.map((list) => (
          <CollectionCard key={list.id} list={list} />
        ))}
        <NewCollectionCard />
        <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
      </div>
    </section>
  );
}
