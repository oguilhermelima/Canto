"use client";

import { PageHeader } from "@/components/page-header";
import { StateMessage } from "@canto/ui/state-message";

export default function NotificationsPage(): React.JSX.Element {
  return (
    <div className="w-full">
      <PageHeader title="Notifications" subtitle="Stay up to date with your activity." />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <StateMessage preset="emptyNotifications" minHeight="400px" />
      </div>
    </div>
  );
}
