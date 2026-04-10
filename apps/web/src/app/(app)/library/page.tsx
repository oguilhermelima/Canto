"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, FolderOpen, History } from "lucide-react";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { DEFAULT_COLLECTION_FILTERS } from "./_components/collection-filter-sidebar";
import { CollectionsTab } from "./_components/collections-tab";
import { HistoryTab } from "./_components/history-tab";
import { WatchedTab } from "./_components/watched-tab";

const TABS = [
  { value: "collections", label: "Collections", icon: FolderOpen },
  { value: "watched", label: "Watched", icon: CheckCircle2 },
  { value: "history", label: "History", icon: History },
];

type Tab = "collections" | "watched" | "history";

export default function LibraryPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab: Tab = (() => {
    const tab = searchParams.get("tab");
    if (
      tab === "collections" ||
      tab === "watched" ||
      tab === "history"
    ) {
      return tab;
    }
    return "collections";
  })();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useDocumentTitle("Library");

  const handleTabChange = (value: string): void => {
    if (
      value !== "collections" &&
      value !== "watched" &&
      value !== "history"
    ) {
      return;
    }
    const tab = value as Tab;
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== "collections") params.set("tab", tab);
    router.replace(`/library${params.size > 0 ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Library"
        subtitle="Collections, watched titles, and your full history."
      />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={TABS}
          value={activeTab}
          onChange={handleTabChange}
        />
        {activeTab === "collections" && <CollectionsTab filters={DEFAULT_COLLECTION_FILTERS} />}
        {activeTab === "watched" && <WatchedTab />}
        {activeTab === "history" && <HistoryTab />}
      </div>
    </div>
  );
}
