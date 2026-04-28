ALTER TABLE "torrent" RENAME TO "download";--> statement-breakpoint
ALTER TABLE "media_file" RENAME COLUMN "torrent_id" TO "download_id";--> statement-breakpoint
ALTER TABLE "download" DROP CONSTRAINT "torrent_hash_unique";--> statement-breakpoint
ALTER TABLE "media_file" DROP CONSTRAINT "media_file_torrent_id_torrent_id_fk";
--> statement-breakpoint
ALTER TABLE "download" DROP CONSTRAINT "torrent_media_id_media_id_fk";
--> statement-breakpoint
DROP INDEX "idx_media_file_torrent";--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_download_id_download_id_fk" FOREIGN KEY ("download_id") REFERENCES "public"."download"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download" ADD CONSTRAINT "download_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_media_file_download" ON "media_file" USING btree ("download_id");--> statement-breakpoint
ALTER TABLE "download" ADD CONSTRAINT "download_hash_unique" UNIQUE("hash");