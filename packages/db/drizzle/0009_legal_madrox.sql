ALTER TABLE "user_playback_progress" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_watch_history" ADD COLUMN "deleted_at" timestamp with time zone;