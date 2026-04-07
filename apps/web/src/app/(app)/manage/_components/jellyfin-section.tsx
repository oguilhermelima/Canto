"use client";

import { JellyfinConnectionSection } from "~/components/settings/services-section";
import { MediaServerSyncSection } from "~/components/settings/media-server-sync";
import { AutoMergeSection } from "~/components/settings/import-seeding";

export function JellyfinSection(): React.JSX.Element {
  return (
    <div>
      <JellyfinConnectionSection />
      <MediaServerSyncSection serverType="jellyfin" />
      <AutoMergeSection />
    </div>
  );
}
