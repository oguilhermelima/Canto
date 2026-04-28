ALTER TABLE "trakt_sync_state" ADD COLUMN "watched_movies_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "watched_shows_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "history_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "watchlist_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "ratings_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "favorites_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "lists_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD COLUMN "playback_at" timestamp with time zone;
