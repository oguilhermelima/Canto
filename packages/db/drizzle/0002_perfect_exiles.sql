ALTER TABLE "sync_episode" ADD COLUMN "source" varchar(20);--> statement-breakpoint
ALTER TABLE "sync_item" ADD COLUMN "jellyfin_server_link_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_item" ADD COLUMN "jellyfin_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_item" ADD COLUMN "plex_server_link_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_item" ADD COLUMN "plex_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_jellyfin_server_link_id_folder_server_link_id_fk" FOREIGN KEY ("jellyfin_server_link_id") REFERENCES "public"."folder_server_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_plex_server_link_id_folder_server_link_id_fk" FOREIGN KEY ("plex_server_link_id") REFERENCES "public"."folder_server_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sync_item_jellyfin_link" ON "sync_item" USING btree ("jellyfin_server_link_id");--> statement-breakpoint
CREATE INDEX "idx_sync_item_plex_link" ON "sync_item" USING btree ("plex_server_link_id");--> statement-breakpoint
-- Backfill: populate new server-specific columns from legacy source + server_link_id
UPDATE "sync_item" SET
  "jellyfin_server_link_id" = "server_link_id",
  "jellyfin_synced_at" = "synced_at"
WHERE "source" = 'jellyfin';--> statement-breakpoint
UPDATE "sync_item" SET
  "plex_server_link_id" = "server_link_id",
  "plex_synced_at" = "synced_at"
WHERE "source" = 'plex';--> statement-breakpoint
-- Backfill: propagate parent item source to sync_episode rows
UPDATE "sync_episode" se SET "source" = si."source"
FROM "sync_item" si
WHERE se."sync_item_id" = si."id" AND si."source" IS NOT NULL;