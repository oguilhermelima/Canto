"use client";

import { LazySection } from "~/components/home/lazy-section";
import { PageHeader } from "~/components/page-header";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { HubWatchNextSection } from "./_components/hub-watch-next-section";
import { HubUpcomingSection } from "./_components/hub-upcoming-section";
import { HubCollectionsSection } from "./_components/hub-collections-section";
import { HubFavoritesSection } from "./_components/hub-favorites-section";
import { HubRatingsSection } from "./_components/hub-ratings-section";
import { HubDroppedSection } from "./_components/hub-dropped-section";
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
        <LazySection id="hub-collections" minHeight={260} eager={false}>
          <HubCollectionsSection />
        </LazySection>
        <LazySection id="hub-history" minHeight={340} eager={false}>
          <HubHistorySection />
        </LazySection>
        <LazySection id="hub-favorites" minHeight={340} eager={false}>
          <HubFavoritesSection />
        </LazySection>
        <LazySection id="hub-ratings" minHeight={340} eager={false}>
          <HubRatingsSection />
        </LazySection>
        <LazySection id="hub-dropped" minHeight={340} eager={false}>
          <HubDroppedSection />
        </LazySection>
      </div>
    </div>
  );
}
