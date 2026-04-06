"use client";

import { useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TabBar } from "~/components/layout/tab-bar";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { SettingsSection } from "~/components/settings/shared";
import { MetadataProvidersSection, DownloadClientSection, IndexersSection, JellyfinConnectionSection, PlexConnectionSection } from "~/components/settings/services-section";
import { SearchSection } from "~/components/settings/search-section";
import { AboutSection } from "~/components/settings/about-section";
import { DownloadFolders } from "~/components/settings/download-folders";
import { ImportMethodSection, SeedingSection, AutoMergeSection } from "~/components/settings/import-seeding";
import { MediaServerSyncSection } from "~/components/settings/media-server-sync";
import { StatusTab } from "~/components/management/status-tab";

import { UsersTab } from "~/components/management/users-tab";

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

/* -------------------------------------------------------------------------- */
/*  Jellyfin tab                                                               */
/* -------------------------------------------------------------------------- */

function JellyfinSection(): React.JSX.Element {
  return (
    <div>
      <JellyfinConnectionSection />
      <MediaServerSyncSection serverType="jellyfin" />
      <AutoMergeSection />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plex tab                                                                   */
/* -------------------------------------------------------------------------- */

function PlexSection(): React.JSX.Element {
  return (
    <div>
      <PlexConnectionSection />
      <MediaServerSyncSection serverType="plex" />
      <AutoMergeSection />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Downloads tab                                                              */
/* -------------------------------------------------------------------------- */

function DownloadsSection(): React.JSX.Element {
  return (
    <div>
      <DownloadClientSection />
      <ImportMethodSection />
      <SettingsSection
        title="Libraries"
        description="Each library defines where files are downloaded, where your media is stored, and how new downloads are routed."
      >
        <DownloadFolders mode="settings" />
      </SettingsSection>
      <SeedingSection />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Search tab                                                                 */
/* -------------------------------------------------------------------------- */

function SearchTabSection(): React.JSX.Element {
  return (
    <div>
      <IndexersSection />
      <SearchSection />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

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

  useEffect(() => { document.title = "Manage — Canto"; }, []);

  // Admin-only page — redirect non-admins to /account
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
