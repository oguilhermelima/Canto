"use client";

import { useDocumentTitle } from "~/hooks/use-document-title";
import { PageHeader } from "~/components/layout/page-header";
import { AppearanceSection } from "../account/_components/appearance-section";
import { HomeSectionsEditor } from "./_components/home-sections-editor";

export default function PersonalizePage(): React.JSX.Element {
  useDocumentTitle("Personalize");

  return (
    <div className="w-full">
      <PageHeader title="Personalize" subtitle="Customize your theme and homepage layout" />

      <div className="flex flex-col gap-10 px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <AppearanceSection />
        <HomeSectionsEditor />
      </div>
    </div>
  );
}
