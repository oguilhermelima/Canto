"use client";

import { Bell } from "lucide-react";

export default function NotificationsPage(): React.JSX.Element {
  return (
    <div className="mx-auto w-full px-4 py-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Notifications</h1>

      <div className="flex min-h-[400px] items-center justify-center">
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
