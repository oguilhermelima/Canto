"use client";

import { ServerSeasonList } from "./server-season-list";
import type { SeasonData } from "./content-season-list";
import type { useManageMedia } from "./use-manage-media";

type ManageData = ReturnType<typeof useManageMedia>;

interface JellyfinTabProps {
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  availability: ManageData["availability"];
  mediaServers: ManageData["mediaServers"];
}

export function JellyfinTab({
  mediaType,
  seasons,
  availability,
  mediaServers,
}: JellyfinTabProps): React.JSX.Element {
  return (
    <ServerSeasonList
      serverName="Jellyfin"
      serverType="jellyfin"
      color="blue"
      mediaType={mediaType}
      seasons={seasons}
      availability={availability}
      serverLink={mediaServers?.jellyfin?.url}
    />
  );
}
