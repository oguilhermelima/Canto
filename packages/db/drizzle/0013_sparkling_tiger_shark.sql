ALTER TABLE "episode" ADD COLUMN "vote_count" integer;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "episode_type" varchar(30);--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "crew" jsonb;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "guest_stars" jsonb;--> statement-breakpoint
ALTER TABLE "season" ADD COLUMN "vote_average" real;