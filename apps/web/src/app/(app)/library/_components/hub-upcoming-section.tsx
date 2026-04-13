"use client";

import { UpcomingScheduleSectionContent } from "~/components/home/upcoming-schedule-section";

export function HubUpcomingSection(): React.JSX.Element {
  return (
    <UpcomingScheduleSectionContent
      title="Upcoming Schedule"
      seeAllHref="/library/upcoming"
    />
  );
}
