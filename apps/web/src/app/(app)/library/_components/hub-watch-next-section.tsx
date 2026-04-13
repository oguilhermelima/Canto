"use client";

import { WatchNextTab } from "./watch-next-tab";

export function HubWatchNextSection(): React.JSX.Element {
  return (
    <WatchNextTab
      view="watch_next"
      title="Watch Next"
      seeAllHref="/library/watch-next"
    />
  );
}
