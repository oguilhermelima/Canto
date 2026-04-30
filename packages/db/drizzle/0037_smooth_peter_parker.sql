DROP INDEX "idx_media_rec_score";--> statement-breakpoint
CREATE INDEX "idx_media_rec_score" ON "media" USING btree ((("vote_count"::numeric * "vote_average"::numeric + 650.0) / ("vote_count"::numeric + 100)) DESC) WHERE "media"."vote_count" >= 50;--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "overview";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "tagline";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "poster_path";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "logo_path";