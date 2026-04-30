export type NotificationId = string & { readonly __brand: "NotificationId" };

export type NotificationType =
  | "import_success"
  | "import_failed"
  | "import_warning"
  | "cross_filesystem_warning"
  | "download_failed"
  | "download_stalled"
  | "blocklist_added"
  | "movie_multi_file";

export interface Notification {
  id: NotificationId;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  mediaId: string | null;
  createdAt: Date;
}

export interface NewNotification {
  title: string;
  message: string;
  type: NotificationType;
  mediaId: string | null;
}
