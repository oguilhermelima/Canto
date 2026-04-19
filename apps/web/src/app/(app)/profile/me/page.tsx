"use client";

import { useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LayoutGrid, Library, BarChart3, Folders } from "lucide-react";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { TabBar } from "@canto/ui/tab-bar";
import { authClient } from "~/lib/auth-client";
import { ProfileHeader } from "./_components/profile-header";
import { OverviewTab } from "./_components/overview-tab";
import { LibraryTab } from "./_components/library-tab";
import { StatsTab } from "./_components/stats-tab";
import { CollectionsTab } from "./_components/collections-tab";
import { ProfilePageSkeleton } from "./_components/profile-skeleton";

const TABS = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "library", label: "Library", icon: Library },
  { value: "stats", label: "Stats", icon: BarChart3 },
  { value: "collection", label: "Collection", icon: Folders },
] as const;

type TabKey = (typeof TABS)[number]["value"];

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();

  useDocumentTitle("Profile");

  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab =
    tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : "overview";

  const setActiveTab = useCallback(
    (key: string) => {
      router.replace(`/profile/me?tab=${key}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return <ProfilePageSkeleton />;
  }

  const tabs = TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }));

  return (
    <div className="w-full">
      <ProfileHeader>
        <TabBar tabs={tabs} value={activeTab} onChange={setActiveTab} />
      </ProfileHeader>

      <div className="px-5 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "library" && <LibraryTab />}
        {activeTab === "stats" && <StatsTab />}
        {activeTab === "collection" && <CollectionsTab />}
      </div>
    </div>
  );
}
