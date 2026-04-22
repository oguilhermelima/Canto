"use client";

import { trpc } from "@/lib/trpc/client";
import { SettingsGroupForm } from "@/components/settings/_primitives";
import { SettingsSection } from "./shared";

export function SearchSection(): React.JSX.Element {
  const { isLoading } = trpc.settings.getAll.useQuery();

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <SettingsSection
        title="Indexer Limits"
        description="Control how many indexers are queried and how long to wait for results. Lower values mean faster searches."
      >
        <SettingsGroupForm groupPrefix="indexers.search" />
      </SettingsSection>
    </div>
  );
}
