"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bookmark, Loader2, Server, List } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { PageHeader } from "~/components/layout/page-header";
import { MediaGrid } from "~/components/media/media-grid";

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading, error } = trpc.list.getBySlug.useQuery({ slug });

  useEffect(() => {
    if (data?.list.name) {
      document.title = `${data.list.name} \u2014 Canto`;
    }
  }, [data?.list.name]);

  const gridItems =
    data?.items.map((item) => ({
      externalId: String(item.media.externalId),
      provider: item.media.provider,
      type: item.media.type as "movie" | "show",
      title: item.media.title,
      posterPath: item.media.posterPath,
      year: item.media.year,
      voteAverage: item.media.voteAverage,
    })) ?? [];

  const emptyIcon =
    data?.list.type === "watchlist" ? Bookmark :
    data?.list.type === "server" ? Server : List;
  const EmptyIcon = emptyIcon;

  return (
    <div className="w-full">
      <PageHeader
        title={data?.list.name ?? "List"}
        subtitle={data?.list.description ?? undefined}
      />

      <div className="px-4 pt-6 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex min-h-[300px] items-center justify-center">
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
        ) : gridItems.length === 0 ? (
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
        ) : (
          <MediaGrid items={gridItems} />
        )}
      </div>
    </div>
  );
}
