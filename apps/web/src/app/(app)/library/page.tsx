"use client";

import { PageHeader } from "~/components/layout/page-header";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { HubWatchNextSection } from "./_components/hub-watch-next-section";
import { HubUpcomingSection } from "./_components/hub-upcoming-section";
import { HubCollectionsSection } from "./_components/hub-collections-section";
import { HubHistorySection } from "./_components/hub-history-section";

export default function LibraryPage(): React.JSX.Element {
  useDocumentTitle("Library");

  return (
    <div className="w-full pb-12">
      <PageHeader title="Library" subtitle="Your personal collection and watch history." />

      <div className="flex flex-col gap-12">
        <HubWatchNextSection />
        <HubUpcomingSection />
        <HubCollectionsSection />
        <HubHistorySection />
      </div>
    </div>
  );
}
