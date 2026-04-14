"use client";

import { useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { authClient } from "~/lib/auth-client";
import { ProfileSection } from "./_components/profile-section";
import { PasswordSection } from "./_components/password-section";
import { AppearanceSection } from "./_components/appearance-section";
import { PreferencesSection } from "./_components/preferences-section";
import { ConnectionsSection } from "./_components/connections-section";
import { HiddenSection } from "./_components/hidden-section";

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "connections", label: "Connections" },
  { value: "preferences", label: "Preferences" },
] as const;

type TabKey = (typeof TABS)[number]["value"];

export default function AccountPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();

  useDocumentTitle("Account");

  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab = tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : "profile";

  const setActiveTab = useCallback(
    (key: string) => {
      router.replace(`/account?tab=${key}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return <div />;
  }

  return (
    <div className="w-full">
      <PageHeader title="Account" subtitle="Manage your profile, connections, and preferences" />

      <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={TABS.map((t) => ({ value: t.value, label: t.label }))}
          value={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === "profile" && (
          <>
            <ProfileSection />
            <PasswordSection />
          </>
        )}
        {activeTab === "connections" && <ConnectionsSection />}
        {activeTab === "preferences" && (
          <>
            <AppearanceSection />
            <PreferencesSection />
            <HiddenSection />
          </>
        )}
      </div>
    </div>
  );
}
