"use client";

import { ServerSeasonList } from "./server-season-list";
import type { SeasonData } from "./content-season-list";
import type { useManageMedia } from "./use-manage-media";

type ManageData = ReturnType<typeof useManageMedia>;

interface PlexTabProps {
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  availability: ManageData["availability"];
  mediaServers: ManageData["mediaServers"];
}

export function PlexTab({
  mediaType,
  seasons,
  availability,
  mediaServers,
}: PlexTabProps): React.JSX.Element {
  return (
    <ServerSeasonList
      serverName="Plex"
      serverType="plex"
      color="amber"
      mediaType={mediaType}
      seasons={seasons}
      availability={availability}
      serverLink={mediaServers?.plex?.url}
    />
  );
}
