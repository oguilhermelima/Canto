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
        title="Libraries"
        description="Each library defines where files are downloaded, where your media is stored, and how new downloads are routed."
      >
        <div className="mb-4 rounded-xl border border-border bg-muted/5 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Canto renames and organizes files in the storage path so media servers can recognize them:
          </p>
          <p className="mt-1.5 font-mono text-xs text-muted-foreground leading-relaxed">
            Movie Title (2024) [tmdbid-12345]/<br />
            <span className="pl-4">Movie Title (2024) [Bluray-1080p][h265].mkv</span>
          </p>
        </div>
        <DownloadFolders mode="settings" />
      </SettingsSection>
      <SeedingSection />
    </div>
  );
}
