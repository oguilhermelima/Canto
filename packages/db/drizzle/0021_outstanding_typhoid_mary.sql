CREATE TABLE "tmdb_certification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(10) NOT NULL,
	"region" varchar(10) NOT NULL,
	"rating" varchar(50) NOT NULL,
	"meaning" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tmdb_certification_unique" ON "tmdb_certification" USING btree ("type","region","rating");--> statement-breakpoint
CREATE INDEX "idx_tmdb_certification_type_region" ON "tmdb_certification" USING btree ("type","region");