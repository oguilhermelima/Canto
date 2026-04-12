"use client";

import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { HomeSectionList, HomeSectionListSkeleton } from "~/components/home/home-section-list";
import { StateMessage } from "~/components/layout/state-message";

export default function DiscoverPage(): React.JSX.Element {
  useDocumentTitle("Discover");

  const { data, isLoading, isError, refetch } = trpc.homeSection.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <HomeSectionListSkeleton />;

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <StateMessage preset="error" onRetry={() => refetch()} />
      </div>
    );
  }

  return <HomeSectionList sections={data?.sections ?? []} />;
}
