"use client";

import { Bell } from "lucide-react";
import { PageHeader } from "~/components/layout/page-header";

export default function NotificationsPage(): React.JSX.Element {
  return (
    <div className="w-full">
      <PageHeader title="Notifications" subtitle="Stay up to date with your activity." />

      <div className="flex min-h-[400px] items-center justify-center px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="text-center">
          <Bell className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="mb-2 text-lg font-medium">No notifications</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Notifications about downloads, imports, and updates will appear
            here.
          </p>
        </div>
      </div>
    </div>
  );
}
