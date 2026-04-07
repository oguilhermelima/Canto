"use client";

import { useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TabBar } from "~/components/layout/tab-bar";
import { authClient } from "~/lib/auth-client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { PageHeader } from "~/components/layout/page-header";
import { MetadataProvidersSection } from "~/components/settings/services-section";
import { AboutSection } from "~/components/settings/about-section";
import { StatusTab } from "~/components/management/status-tab";
import { UsersTab } from "~/components/management/users-tab";
import { JellyfinSection } from "./_components/jellyfin-section";
import { PlexSection } from "./_components/plex-section";
import { DownloadsSection } from "./_components/downloads-section";
import { SearchTabSection } from "./_components/search-tab-section";

const NAV_ITEMS = [
  { key: "status", label: "Status" },
  { key: "users", label: "Users" },
  { key: "metadata", label: "Metadata" },
  { key: "downloads", label: "Libraries" },
  { key: "search", label: "Indexers" },
  { key: "jellyfin", label: "Jellyfin" },
  { key: "plex", label: "Plex" },
  { key: "about", label: "About" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

export default function ManagePage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const tabParam = searchParams.get("tab") as NavKey | null;
  const activeNav = tabParam && NAV_ITEMS.some((i) => i.key === tabParam) ? tabParam : "status";

  const setActiveNav = useCallback((key: string) => {
    router.replace(`/manage?tab=${key}`, { scroll: false });
  }, [router]);

  useDocumentTitle("Manage");

  useEffect(() => {
    if (!isPending && session && !isAdmin) {
      router.replace("/account");
    }
  }, [isPending, session, isAdmin, router]);

  if (isPending || !isAdmin) return <div />;

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
        {activeNav === "jellyfin" && <JellyfinSection />}
        {activeNav === "plex" && <PlexSection />}
        {activeNav === "about" && <AboutSection />}
      </div>
    </div>
  );
}
