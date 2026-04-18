"use client";

import { useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Star,
  Library,
  CheckCircle2,
  Heart,
  XCircle,
} from "lucide-react";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { TabBar } from "@canto/ui/tab-bar";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { ProfileHeader } from "./_components/profile-header";
import { OverviewTab } from "./_components/overview-tab";
import { MediaStatusTab } from "./_components/media-status-tab";
import { RatingsTab } from "./_components/ratings-tab";
import { FavoritesTab } from "./_components/favorites-tab";
import { CollectionsTab } from "./_components/collections-tab";
import { ProfilePageSkeleton } from "./_components/profile-skeleton";
const TABS = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "ratings", label: "Ratings", icon: Star },
  { value: "collections", label: "Collections", icon: Library },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
  { value: "favorites", label: "Favorites", icon: Heart },
  { value: "dropped", label: "Dropped", icon: XCircle },
] as const;

type TabKey = (typeof TABS)[number]["value"];

const COUNT_MAP: Partial<Record<TabKey, string>> = {
  ratings: "rated",
  completed: "completed",
  favorites: "favorites",
  dropped: "dropped",
};

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const { data: counts } = trpc.userMedia.getUserMediaCounts.useQuery();

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

  const tabs = TABS.map((t) => {
    const countKey = COUNT_MAP[t.value] as keyof NonNullable<typeof counts> | undefined;
    const count = countKey ? counts?.[countKey] : undefined;
    return { value: t.value, label: t.label, icon: t.icon, count };
  });

  return (
    <div className="w-full">
      <ProfileHeader>
        <TabBar tabs={tabs} value={activeTab} onChange={setActiveTab} />
      </ProfileHeader>

      <div className="px-5 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "ratings" && <RatingsTab />}
        {activeTab === "collections" && <CollectionsTab />}
        {activeTab === "completed" && <MediaStatusTab status="completed" />}
        {activeTab === "favorites" && <FavoritesTab />}
        {activeTab === "dropped" && <MediaStatusTab status="dropped" />}
      </div>
    </div>
  );
}
