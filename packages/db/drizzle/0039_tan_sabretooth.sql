CREATE INDEX "idx_download_status" ON "download" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_download_media" ON "download" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_download_imported" ON "download" USING btree ("imported") WHERE "download"."imported" = false;--> statement-breakpoint
CREATE INDEX "idx_download_created" ON "download" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_request_user_status" ON "download_request" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_media_file_pending" ON "media_file" USING btree ("status") WHERE "media_file"."status" = 'pending';