"use client";

import { IndexersSection } from "~/components/settings/services-section";
import { SearchSection } from "~/components/settings/search-section";

export function SearchTabSection(): React.JSX.Element {
  return (
    <div>
      <IndexersSection />
      <SearchSection />
    </div>
  );
}
