"use client";

import { PageHeader } from "~/components/layout/page-header";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { DEFAULT_COLLECTION_FILTERS } from "../_components/collection-filter-sidebar";
import { CollectionsTab } from "../_components/collections-tab";

export default function CollectionsPage(): React.JSX.Element {
  useDocumentTitle("Collections");

  return (
    <div className="w-full pb-12">
      <PageHeader title="Collections" subtitle="Organize your movies and shows into lists." />
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <CollectionsTab filters={DEFAULT_COLLECTION_FILTERS} />
      </div>
    </div>
  );
}
