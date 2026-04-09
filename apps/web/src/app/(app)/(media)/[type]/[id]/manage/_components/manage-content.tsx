"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { useManageMedia } from "./use-manage-media";
import { PreferencesTab } from "./preferences-tab";
import { DownloadsTab } from "./downloads-tab";
import { ServersTab } from "./servers-tab";
import { DangerZoneTab } from "./danger-zone-tab";

const TABS = [
  { value: "preferences", label: "Preferences" },
  { value: "downloads", label: "Torrents" },
  { value: "servers", label: "Servers" },
  { value: "danger", label: "Danger Zone" },
] as const;

type Tab = (typeof TABS)[number]["value"];

interface ManageContentProps {
  id: string;
  mediaType: "movie" | "show";
}

export function ManageContent({
  id,
  mediaType,
}: ManageContentProps): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";

  const [activeTab, setActiveTab] = useState<Tab>("preferences");

  const manage = useManageMedia(id, mediaType);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">
          This page is only available to administrators.
        </p>
      </div>
    );
  }

  if (manage.isLoading || !manage.media) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader title={manage.media.title} subtitle="Manage media settings" />

      <div className="px-4 pt-6 pb-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={TABS.map((t) => ({ value: t.value, label: t.label }))}
          value={activeTab}
          onChange={(v) => setActiveTab(v as Tab)}
        />
      </div>

      <div className="px-4 pb-12 pt-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="w-full">
          {activeTab === "preferences" && (
            <PreferencesTab
              media={manage.media}
              mediaId={manage.mediaId!}
              mediaType={mediaType}
              libraries={manage.libraries}
              setMediaLibrary={manage.setMediaLibrary}
              setContinuousDownload={manage.setContinuousDownload}
              refreshMeta={manage.refreshMeta}
              invalidateMedia={manage.invalidateMedia}
            />
          )}

          {activeTab === "downloads" && (
            <DownloadsTab
              mediaType={mediaType}
              seasons={manage.seasons}
              torrentsLoading={manage.torrentsLoading}
              filesByEpKey={manage.filesByEpKey}
              movieFiles={manage.movieFiles}
              liveTorrents={manage.liveTorrents}
              torrentsBySeason={manage.torrentsBySeason}
              torrentPause={manage.torrentPause}
              torrentResume={manage.torrentResume}
              torrentDelete={manage.torrentDelete}
              torrentRetry={manage.torrentRetry}
              torrentRename={manage.torrentRename}
              torrentMove={manage.torrentMove}
            />
          )}

          {activeTab === "servers" && (
            <ServersTab
              mediaType={mediaType}
              seasons={manage.seasons}
              availability={manage.availability}
              mediaServers={manage.mediaServers}
            />
          )}

          {activeTab === "danger" && (
            <DangerZoneTab
              media={manage.media}
              mediaId={manage.mediaId!}
              mediaTorrents={manage.mediaTorrents}
              removeFromServer={manage.removeFromServer}
              addToLibrary={manage.addToLibrary}
              markDownloaded={manage.markDownloaded}
              deleteMutation={manage.deleteMutation}
              torrentDelete={manage.torrentDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
