"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { SectionTitle } from "~/components/layout/section-title";
import { trpc } from "~/lib/trpc/client";

function posterSrc(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w342${path}`;
}

function CollectionCard({
  list,
}: {
  list: {
    id: string;
    slug: string;
    name: string;
    type: string;
    itemCount: number;
    previewPosters: string[] | null;
  };
}): React.JSX.Element {
  const posters = (list.previewPosters ?? []).slice(0, 4);

  return (
    <Link
      href={`/collection/${list.slug}`}
      className="group relative flex w-[260px] shrink-0 overflow-hidden rounded-xl transition-all duration-300 hover:z-10 hover:scale-[1.03] hover:ring-2 hover:ring-foreground/20 sm:w-[280px] lg:w-[300px]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {posters.length >= 3 ? (
          <div className="grid h-full w-full grid-cols-3">
            {posters.slice(0, 3).map((poster, i) => (
              <div key={`${poster}-${i}`} className="relative h-full overflow-hidden">
                <Image
                  src={posterSrc(poster)}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="100px"
                />
              </div>
            ))}
          </div>
        ) : posters.length > 0 ? (
          <Image
            src={posterSrc(posters[0]!)}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="300px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <span className="text-3xl font-bold">
              {list.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
          <p className="truncate text-sm font-semibold text-white">
            {list.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-white/70">
              {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
            </span>
            {(list.type === "watchlist" || list.type === "server") && (
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                System
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function NewCollectionCard(): React.JSX.Element {
  return (
    <Link
      href="/library/collections"
      className="group relative flex w-[260px] shrink-0 overflow-hidden rounded-xl border border-dashed border-border/50 transition-all duration-300 hover:border-foreground/20 hover:bg-muted/30 sm:w-[280px] lg:w-[300px]"
    >
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <Plus className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          New Collection
        </p>
      </div>
    </Link>
  );
}

export function HubCollectionsSection(): React.JSX.Element {
  const { data: lists, isLoading, isError, refetch } = trpc.list.getAll.useQuery();
  const layoutQuery = trpc.list.getCollectionLayout.useQuery();

  // DB returns lists in position order — filter hidden only
  const visibleLists = useMemo(() => {
    const hiddenSet = new Set(layoutQuery.data?.hiddenListIds ?? []);
    return (lists ?? []).filter((l) => !hiddenSet.has(l.id));
  }, [lists, layoutQuery.data]);

  if (isLoading || layoutQuery.isLoading) {
    return (
      <section className="relative">
        <SectionTitle title="Collections" seeMorePath="/library/collections" />
        <div className="mt-2 flex gap-4 overflow-x-auto md:mt-4 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[16/9] w-[260px] shrink-0 animate-pulse rounded-xl bg-muted sm:w-[280px] lg:w-[300px]"
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
        <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6">
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
        <SectionTitle title="Collections" />
        <div className="mt-2 md:mt-4 rounded-2xl px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 border border-border/50 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          No collections yet. Launch your first collection to organize your galaxy of titles.
        </div>
      </section>
    );
  }

  return (
    <section className="relative">
      <SectionTitle title="Collections" seeMorePath="/library/collections" />

      <div className="mt-2 flex gap-4 overflow-x-auto md:mt-4 overflow-y-visible pt-1 pb-2 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {visibleLists.map((list) => (
          <CollectionCard key={list.id} list={list} />
        ))}
        <NewCollectionCard />
        <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
      </div>
    </section>
  );
}
