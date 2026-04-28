"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PageHeader } from "@/components/page-header";
import { ManageSidebar, ManageMobileList } from "./_components/manage-nav";
import { ManageContent } from "./_components/manage-content";
import { ALL_MANAGE_KEYS, DEFAULT_MANAGE_SECTION, MANAGE_SECTIONS } from "./_components/manage-config";

export default function ManagePage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  useDocumentTitle("Manage");

  const sectionParam = searchParams.get("section");
  const activeSection = sectionParam && ALL_MANAGE_KEYS.includes(sectionParam)
    ? sectionParam
    : null;

  // Desktop always resolves to a section
  const desktopSection = activeSection ?? DEFAULT_MANAGE_SECTION;

  // Find active section metadata for mobile header
  const activeSectionMeta = MANAGE_SECTIONS
    .flatMap((g) => g.items)
    .find((i) => i.key === activeSection);

  return (
    <div className="w-full">
      {/* Desktop: always show page header */}
      <div className={activeSection ? "hidden md:block" : ""}>
        <PageHeader title="Manage" subtitle="Server configuration and administration." />
      </div>

      {/* Mobile: section detail header (TitleBar inside is already md:hidden) */}
      {activeSection && activeSectionMeta && (
        <PageHeader
          title={activeSectionMeta.label}
          subtitle={activeSectionMeta.description}
          onNavigate={() => router.replace("/manage", { scroll: false })}
          className="md:hidden"
        />
      )}

      <div className="px-4 md:pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Desktop: sidebar + content grid */}
        <div className="hidden md:grid md:grid-cols-[240px_1fr] md:gap-10 lg:gap-16">
          <ManageSidebar activeSection={desktopSection} />
          <div className="min-w-0">
            <ManageContent section={desktopSection} />
          </div>
        </div>

        {/* Mobile: list or section content */}
        <div className="md:hidden">
          {activeSection ? (
            <ManageContent section={activeSection} />
          ) : (
            <ManageMobileList />
          )}
        </div>
      </div>
    </div>
  );
}
