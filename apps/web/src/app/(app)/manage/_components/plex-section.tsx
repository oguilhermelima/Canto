"use client";

import { PlexConnectionSection } from "~/components/settings/services-section";
import { MediaServerSyncSection } from "~/components/settings/media-server-sync";
import { AutoMergeSection } from "~/components/settings/import-seeding";

export function PlexSection(): React.JSX.Element {
  return (
    <div>
      <PlexConnectionSection />
      <MediaServerSyncSection serverType="plex" />
      <AutoMergeSection />
    </div>
  );
}
