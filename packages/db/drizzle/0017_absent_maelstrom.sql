ALTER TABLE "user_recommendation" ADD COLUMN "external_id" integer;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "provider" varchar(20);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "type" varchar(10);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "title" varchar(500);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "poster_path" varchar(255);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "backdrop_path" varchar(255);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "logo_path" varchar(255);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "vote_average" real;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "release_date" date;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "genre_ids" jsonb;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "runtime" integer;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "original_language" varchar(10);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "content_rating" varchar(20);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "status" varchar(50);--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD COLUMN "popularity" real;--> statement-breakpoint
CREATE INDEX "idx_video_media_type_site" ON "media_video" USING btree ("media_id","type","site");--> statement-breakpoint
CREATE INDEX "idx_user_rec_hot" ON "user_recommendation" USING btree ("user_id","active","weight" DESC);
