ALTER TABLE "folder_server_link" ADD COLUMN "content_type" varchar(20);
ALTER TABLE "folder_server_link" ADD COLUMN "last_synced_at" timestamp with time zone;
