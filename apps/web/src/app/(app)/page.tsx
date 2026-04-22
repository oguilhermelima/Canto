"use client";

import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { HomeSectionList } from "@/components/home/home-section-list";
import { StateMessage } from "@canto/ui/state-message";

export default function DiscoverPage(): React.JSX.Element {
  useDocumentTitle("Discover");

  const { data, isLoading, isError, refetch } = trpc.homeSection.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <StateMessage preset="error" onRetry={() => refetch()} />
      </div>
    );
  }

  return <HomeSectionList sections={data?.sections ?? []} isLoading={isLoading} />;
}
