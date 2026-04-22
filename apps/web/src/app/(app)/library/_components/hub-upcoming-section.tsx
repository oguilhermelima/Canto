"use client";

import { CalendarClock } from "lucide-react";
import { UpcomingScheduleSectionContent } from "@/components/home/upcoming-schedule-section";

export function HubUpcomingSection(): React.JSX.Element {
  return (
    <UpcomingScheduleSectionContent
      title="Upcoming Schedule"
      icon={CalendarClock}
      seeAllHref="/library/upcoming"
    />
  );
}
