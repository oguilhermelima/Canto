"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { ProfileSection } from "./_components/profile-section";
import { PasswordSection } from "./_components/password-section";
import { AppearanceSection } from "./_components/appearance-section";
import { PreferencesSection } from "./_components/preferences-section";

export default function AccountPage(): React.JSX.Element {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    document.title = "Account — Canto";
  }, []);

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
      <PageHeader title="Account" subtitle="Manage your profile, appearance, and preferences" />

      <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ProfileSection />
        <PasswordSection />
        <AppearanceSection />
        <PreferencesSection />
      </div>
    </div>
  );
}
