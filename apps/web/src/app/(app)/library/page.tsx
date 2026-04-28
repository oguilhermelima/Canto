"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, History as HistoryIcon } from "lucide-react";
import { TabBar } from "@canto/ui/tab-bar";
import { LazySection } from "@/components/home/lazy-section";
import { PageHeader } from "@/components/page-header";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { HubWatchNextSection } from "./_components/hub-watch-next-section";
import { HubWatchlistSection } from "./_components/hub-watchlist-section";
import { HubUpcomingCalendar } from "./_components/hub-upcoming-calendar";
import { HubServerLibrarySection } from "./_components/hub-server-library-section";
import { HubCollectionsSection } from "./_components/hub-collections-section";
import { HubFavoritesSection } from "./_components/hub-favorites-section";
import { HubRatingsSection } from "./_components/hub-ratings-section";
import { HubDroppedSection } from "./_components/hub-dropped-section";
import { HubHistoryDiary } from "./_components/hub-history-diary";

const TABS = [
  { value: "hub", label: "Hub", icon: LayoutGrid },
  { value: "activity", label: "Activity", icon: HistoryIcon },
] as const;

type TabKey = (typeof TABS)[number]["value"];

export default function LibraryPage(): React.JSX.Element {
  useDocumentTitle("Library");
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey =
    tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : "hub";

  const setActiveTab = useCallback(
    (value: string) => {
      router.replace(`/library?tab=${value}`, { scroll: false });
    },
    [router],
  );

  const tabs = TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }));

  return (
    <div className="w-full md:pb-12">
      <PageHeader
        title="Library"
        tabs={<TabBar tabs={tabs} value={activeTab} onChange={setActiveTab} />}
      />

      {activeTab === "hub" && (
        <div className="mt-6 flex flex-col gap-6 md:mt-8 md:gap-12">
          <LazySection id="hub-watch-next" minHeight={260} eager={true}>
            <HubWatchNextSection />
          </LazySection>
          <LazySection id="hub-upcoming" minHeight={260} eager={false}>
            <HubUpcomingCalendar />
          </LazySection>
          <LazySection id="hub-watchlist" minHeight={260} eager={false}>
            <HubWatchlistSection />
          </LazySection>
          <LazySection id="hub-collections" minHeight={260} eager={false}>
            <HubCollectionsSection />
          </LazySection>
          <LazySection id="hub-server-library" minHeight={260} eager={false}>
            <HubServerLibrarySection />
          </LazySection>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="mt-6 flex flex-col gap-6 md:mt-8 md:gap-12">
          <LazySection id="hub-history" minHeight={340} eager={true}>
            <HubHistoryDiary />
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
      )}
    </div>
  );
}
