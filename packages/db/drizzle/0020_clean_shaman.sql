CREATE TABLE "media_content_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"region" varchar(10) NOT NULL,
	"rating" varchar(50) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_content_rating" ADD CONSTRAINT "media_content_rating_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_content_rating_unique" ON "media_content_rating" USING btree ("media_id","region");--> statement-breakpoint
CREATE INDEX "idx_media_content_rating_media" ON "media_content_rating" USING btree ("media_id");