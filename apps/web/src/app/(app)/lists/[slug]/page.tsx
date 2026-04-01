"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bookmark, Loader2, Server, List } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout } from "~/components/layout/browse-layout";
import { TabBar } from "~/components/layout/tab-bar";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV Shows" },
] as const;

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");

  const { data, isLoading, error } = trpc.list.getBySlug.useQuery({
    slug,
    limit: 100,
  });

  useEffect(() => {
    if (data?.list.name) {
      document.title = `${data.list.name} — Canto`;
    }
  }, [data?.list.name]);

  const allItems = useMemo(
    () =>
      data?.items.map((item) => ({
        externalId: item.media.externalId,
        provider: item.media.provider,
        type: item.media.type as "movie" | "show",
        title: item.media.title,
        posterPath: item.media.posterPath,
        year: item.media.year ?? undefined,
        voteAverage: item.media.voteAverage ?? undefined,
      })) ?? [],
    [data],
  );

  const filteredItems = useMemo(
    () =>
      typeFilter === "all"
        ? allItems
        : allItems.filter((i) => i.type === typeFilter),
    [allItems, typeFilter],
  );

  const handleTypeChange = useCallback((v: string) => {
    setTypeFilter(v as "all" | "movie" | "show");
  }, []);

  const emptyIcon =
    data?.list.type === "watchlist"
      ? Bookmark
      : data?.list.type === "server"
        ? Server
        : List;
  const EmptyIcon = emptyIcon;

  if (error) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <div className="text-center">
          <List className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
          <p className="text-lg font-medium text-muted-foreground">
            List not found
          </p>
          <Link
            href="/lists"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Lists
          </Link>
        </div>
      </div>
    );
  }

  return (
    <BrowseLayout
      title={data?.list.name ?? "List"}
      mediaType={typeFilter}
      toolbar={
        <TabBar
          tabs={TYPE_OPTIONS.map(({ value, label }) => ({ value, label }))}
          value={typeFilter}
          onChange={handleTypeChange}
        />
      }
      items={filteredItems}
      totalResults={filteredItems.length}
      isLoading={isLoading}
      isFetchingNextPage={false}
      hasNextPage={false}
      onFetchNextPage={() => {}}
      emptyState={
        !isLoading && allItems.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <EmptyIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
              <p className="text-lg font-medium text-muted-foreground">
                This list is empty
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Browse media and add items to get started.
              </p>
              <Link
                href="/"
                className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Discover Media
              </Link>
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
