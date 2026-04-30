"use client";

import { trpc } from "@/lib/trpc/client";
import { SettingsGroupForm } from "@/components/settings/_primitives";
import { SettingsSection } from "./shared";

/**
 * Renders the `cadence.*` settings registry group. Each key declares its
 * own `inputType: "number"` so the generic `<SettingsGroupForm>` resolves
 * the label, help text, default, and persistence wiring per row.
 */
export function RefreshCadenceSection(): React.JSX.Element {
  const { isLoading } = trpc.settings.getAll.useQuery();

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <SettingsSection
      title="Refresh Cadence"
      description="Tune how often the worker re-fetches media metadata from providers. Lower values keep data fresher at the cost of more provider traffic."
    >
      <SettingsGroupForm groupPrefix="cadence" />
    </SettingsSection>
  );
}
