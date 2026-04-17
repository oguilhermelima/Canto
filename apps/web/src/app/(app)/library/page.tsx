"use client";

import { LazySection } from "~/components/home/lazy-section";
import { PageHeader } from "~/components/page-header";
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

      <div className="flex flex-col gap-10 md:gap-14">
        <LazySection id="hub-watch-next" minHeight={260} eager={true}>
          <HubWatchNextSection />
        </LazySection>
        <LazySection id="hub-upcoming" minHeight={260} eager={false}>
          <HubUpcomingSection />
        </LazySection>
        <LazySection id="hub-collections" minHeight={230} eager={false}>
          <HubCollectionsSection />
        </LazySection>
        <LazySection id="hub-history" minHeight={500} eager={false}>
          <HubHistorySection />
        </LazySection>
      </div>
    </div>
  );
}
