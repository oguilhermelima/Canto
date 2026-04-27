"use client";

import { DownloadClientSection } from "@/components/settings/services-section";
import { ImportMethodSection, SeedingSection } from "@/components/settings/import-seeding";
import { SettingsSection } from "@/components/settings/shared";
import { DownloadFolders } from "@/components/settings/download-folders";

export function DownloadsSection(): React.JSX.Element {
  return (
    <div>
      <DownloadClientSection />
      <ImportMethodSection />
      <SettingsSection
        variant="grid"
        title="Libraries"
        description="Per-category routing. Each library maps a qBittorrent category to its download path, storage path, and routing rules."
      >
        <div className="rounded-2xl bg-muted/[0.04] p-4 sm:p-5">
          <DownloadFolders mode="settings" />
        </div>
      </SettingsSection>
      <SeedingSection />
    </div>
  );
}
