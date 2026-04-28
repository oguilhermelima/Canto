CREATE TABLE "download_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoring_rules" jsonb NOT NULL,
	"preferred_editions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avoided_editions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"av1_stance" varchar(10) DEFAULT 'neutral' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_release_group" (
	"name_lower" varchar(100) NOT NULL,
	"flavor" varchar(10) NOT NULL,
	"tier" varchar(10) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "download_release_group_name_lower_flavor_pk" PRIMARY KEY("name_lower","flavor")
);
--> statement-breakpoint
CREATE INDEX "idx_download_release_group_flavor_tier" ON "download_release_group" USING btree ("flavor","tier");