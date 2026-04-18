"use client";

import { Play } from "lucide-react";
import { WatchNextTab } from "./watch-next-tab";

export function HubWatchNextSection(): React.JSX.Element {
  return (
    <WatchNextTab
      view="watch_next"
      title="Watch Next"
      icon={Play}
      seeAllHref="/library/watch-next"
    />
  );
}
