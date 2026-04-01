"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { PageHeader } from "~/components/layout/page-header";
import { MediaGrid } from "~/components/media/media-grid";

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading } = trpc.list.getBySlug.useQuery({ slug });

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
        ) : (
          <MediaGrid items={gridItems} />
        )}
      </div>
    </div>
  );
}
