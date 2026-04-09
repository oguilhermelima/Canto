"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, FolderOpen, History, PlayCircle } from "lucide-react";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { DEFAULT_COLLECTION_FILTERS } from "./_components/collection-filter-sidebar";
import { CollectionsTab } from "./_components/collections-tab";
import { WatchNextTab } from "./_components/watch-next-tab";
import { HistoryTab } from "./_components/history-tab";

const TABS = [
  { value: "continue-watching", label: "Continue Watching", icon: PlayCircle },
  { value: "watch-next", label: "Watch Next", icon: Clock3 },
  { value: "collections", label: "Collections", icon: FolderOpen },
  { value: "history", label: "History", icon: History },
];

type Tab = "continue-watching" | "watch-next" | "collections" | "history";

export default function LibraryPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab: Tab = (() => {
    const tab = searchParams.get("tab");
    if (
      tab === "continue-watching" ||
      tab === "watch-next" ||
      tab === "collections" ||
      tab === "history"
    ) {
      return tab;
    }
    return "continue-watching";
  })();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useDocumentTitle("Library");

  const handleTabChange = (value: string): void => {
    if (
      value !== "continue-watching" &&
      value !== "watch-next" &&
      value !== "collections" &&
      value !== "history"
    ) {
      return;
    }
    const tab = value as Tab;
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== "continue-watching") params.set("tab", tab);
    router.replace(`/library${params.size > 0 ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Library"
        subtitle="Continue watching, watch next, collections, and history."
      />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={TABS}
          value={activeTab}
          onChange={handleTabChange}
        />
        {activeTab === "continue-watching" && <WatchNextTab view="continue" />}
        {activeTab === "watch-next" && <WatchNextTab view="watch_next" />}
        {activeTab === "collections" && <CollectionsTab filters={DEFAULT_COLLECTION_FILTERS} />}
        {activeTab === "history" && <HistoryTab />}
      </div>
    </div>
  );
}
