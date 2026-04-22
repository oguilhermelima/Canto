"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Folders } from "lucide-react";
import { TabBar } from "@canto/ui/tab-bar";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { trpc } from "@/lib/trpc/client";
import { PublicProfileHeader } from "./public-profile-header";
import { PublicOverviewTab } from "./public-overview-tab";
import { PublicCollectionsTab } from "./public-collections-tab";
import { ProfilePageSkeleton } from "../../me/_components/profile-skeleton";

const TABS = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "collection", label: "Collection", icon: Folders },
] as const;

type TabKey = (typeof TABS)[number]["value"];

export function PublicProfileContent({ userId }: { userId: string }): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, isLoading, error } = trpc.publicProfile.get.useQuery(
    { id: userId },
    { retry: false },
  );

  const displayName = data?.profile.name ?? "Profile";
  useDocumentTitle(displayName);

  // If this is actually the current user, redirect to canonical /profile/me.
  useEffect(() => {
    if (data?.isOwner) {
      router.replace("/profile/me");
    }
  }, [data?.isOwner, router]);

  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab =
    tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : "overview";

  const setActiveTab = useCallback(
    (key: string) => {
      router.replace(`/profile/${userId}?tab=${key}`, { scroll: false });
    },
    [router, userId],
  );

  if (isLoading || data?.isOwner) {
    return <ProfilePageSkeleton />;
  }

  if (error?.data?.code === "NOT_FOUND" || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-5">
        <StateMessage preset="notFound" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <PublicProfileHeader profile={data.profile}>
        <TabBar
          tabs={TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))}
          value={activeTab}
          onChange={setActiveTab}
        />
      </PublicProfileHeader>

      <div className="px-5 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {activeTab === "overview" && <PublicOverviewTab userId={userId} />}
        {activeTab === "collection" && <PublicCollectionsTab userId={userId} />}
      </div>
    </div>
  );
}
