"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { PageHeader } from "~/components/layout/page-header";
import { authClient } from "~/lib/auth-client";
import { PreferencesSidebar, PreferencesMobileList } from "./_components/preferences-nav";
import { PreferencesContent } from "./_components/preferences-content";
import { ALL_SECTION_KEYS, DEFAULT_SECTION, PREFERENCES_SECTIONS } from "./_components/preferences-config";

export default function PreferencesPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();

  useDocumentTitle("Preferences");

  const sectionParam = searchParams.get("section");
  const activeSection = sectionParam && ALL_SECTION_KEYS.includes(sectionParam)
    ? sectionParam
    : null;

  // Desktop always resolves to a section
  const desktopSection = activeSection ?? DEFAULT_SECTION;

  // Find active section metadata for mobile header
  const activeSectionMeta = PREFERENCES_SECTIONS
    .flatMap((g) => g.items)
    .find((i) => i.key === activeSection);

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
      {/* Desktop: always show page header */}
      <div className={activeSection ? "hidden md:block" : ""}>
        <PageHeader title="Preferences" subtitle="Manage your profile, connections, and homepage layout." />
      </div>

      {/* Mobile: section detail header (TitleBar inside is already md:hidden) */}
      {activeSection && activeSectionMeta && (
        <PageHeader
          title={activeSectionMeta.label}
          subtitle={activeSectionMeta.description}
          onNavigate={() => router.replace("/preferences", { scroll: false })}
          className="md:hidden"
        />
      )}

      <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Desktop: sidebar + content grid */}
        <div className="hidden md:grid md:grid-cols-[240px_1fr] md:gap-10 lg:gap-16">
          <PreferencesSidebar activeSection={desktopSection} />
          <div className="min-w-0">
            <PreferencesContent section={desktopSection} />
          </div>
        </div>

        {/* Mobile: list or section content */}
        <div className="md:hidden">
          {activeSection ? (
            <PreferencesContent section={activeSection} />
          ) : (
            <PreferencesMobileList />
          )}
        </div>
      </div>
    </div>
  );
}
