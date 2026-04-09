"use client";

import { MediaServerConnectionSection } from "~/components/settings/services-section";
import { MediaServerSyncSection } from "~/components/settings/media-server-sync";
import { AutoMergeSection } from "~/components/settings/import-seeding";

export function MediaServersSection(): React.JSX.Element {
  return (
    <div>
      <MediaServerConnectionSection />
      <AutoMergeSection />
      <MediaServerSyncSection />
    </div>
  );
}
