DROP INDEX "idx_list_item_unique";--> statement-breakpoint
ALTER TABLE "list_item" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "list_item" ADD COLUMN "deleted_by" varchar(20);--> statement-breakpoint
ALTER TABLE "list_item" ADD COLUMN "last_pushed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_list_item_tombstone" ON "list_item" USING btree ("list_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_item_unique" ON "list_item" USING btree ("list_id","media_id") WHERE "list_item"."deleted_at" IS NULL;