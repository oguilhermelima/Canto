"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TabBar } from "~/components/layout/tab-bar";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { PageHeader } from "~/components/layout/page-header";
import { MetadataProvidersSection } from "~/components/settings/services-section";
import { AboutSection } from "~/components/settings/about-section";
import { StatusTab } from "~/components/management/status-tab";
import { UsersTab } from "~/components/management/users-tab";
import { MediaServersSection } from "./_components/media-servers-section";
import { DownloadsSection } from "./_components/downloads-section";
import { SearchTabSection } from "./_components/search-tab-section";
import { ManualScanSection } from "./_components/manual-scan-section";

const NAV_ITEMS = [
  { key: "status", label: "Status" },
  { key: "users", label: "Users" },
  { key: "metadata", label: "Metadata" },
  { key: "search", label: "Indexers" },
  { key: "downloads", label: "Libraries" },
  { key: "media-servers", label: "Media Servers" },
  { key: "manual-scan", label: "Manual Scan" },
  { key: "about", label: "About" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

export default function ManagePage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const resolvedTab = tabParam === "jellyfin" || tabParam === "plex" ? "media-servers" as const : tabParam as NavKey | null;
  const activeNav = resolvedTab && NAV_ITEMS.some((i) => i.key === resolvedTab) ? resolvedTab : "status";

  const setActiveNav = useCallback((key: string) => {
    router.replace(`/manage?tab=${key}`, { scroll: false });
  }, [router]);

  useDocumentTitle("Manage");

  return (
    <div className="w-full">
      <PageHeader title="Manage" subtitle="Server configuration and administration" />

      <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={NAV_ITEMS.map((item) => ({ value: item.key, label: item.label }))}
          value={activeNav}
          onChange={setActiveNav}
        />
        {activeNav === "status" && <StatusTab />}
        {activeNav === "users" && <UsersTab />}
        {activeNav === "metadata" && <MetadataProvidersSection />}
        {activeNav === "downloads" && <DownloadsSection />}
        {activeNav === "search" && <SearchTabSection />}
        {activeNav === "media-servers" && <MediaServersSection />}
        {activeNav === "manual-scan" && <ManualScanSection />}
        {activeNav === "about" && <AboutSection />}
      </div>
    </div>
  );
}
