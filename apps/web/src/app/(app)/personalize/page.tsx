"use client";

import { useState } from "react";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { AppearanceSection } from "../account/_components/appearance-section";
import { HomeSectionsEditor } from "./_components/home-sections-editor";

const TABS = [
  { value: "sections", label: "Home Sections" },
  { value: "appearance", label: "Appearance" },
];

export default function PersonalizePage(): React.JSX.Element {
  useDocumentTitle("Personalize");
  const [tab, setTab] = useState("sections");

  return (
    <div className="w-full">
      <PageHeader title="Personalize" subtitle="Customize your theme and homepage layout." />

      <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar tabs={TABS} value={tab} onChange={setTab} />

        {tab === "sections" && <HomeSectionsEditor />}
        {tab === "appearance" && <AppearanceSection />}
      </div>
    </div>
  );
}
