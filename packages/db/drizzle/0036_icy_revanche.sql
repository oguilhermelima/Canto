DROP INDEX "idx_media_rec_enriched";--> statement-breakpoint
DROP INDEX "idx_media_rec_score";--> statement-breakpoint
CREATE INDEX "idx_media_rec_enriched" ON "media" USING btree ("release_date" DESC) WHERE "media"."backdrop_path" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_media_rec_score" ON "media" USING btree ((("vote_count"::numeric * "vote_average"::numeric + 650.0) / ("vote_count"::numeric + 100)) DESC) WHERE "media"."poster_path" IS NOT NULL AND "media"."vote_count" >= 50;--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "extras_updated_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "metadata_updated_at";