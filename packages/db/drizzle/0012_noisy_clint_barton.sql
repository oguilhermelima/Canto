CREATE TABLE "profile_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"position" integer NOT NULL,
	"section_key" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_hidden_media" (
	"user_id" varchar(36) NOT NULL,
	"external_id" integer NOT NULL,
	"provider" varchar(20) DEFAULT 'tmdb' NOT NULL,
	"type" varchar(10) NOT NULL,
	"title" varchar(500) NOT NULL,
	"poster_path" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_hidden_media_user_id_external_id_provider_pk" PRIMARY KEY("user_id","external_id","provider")
);
--> statement-breakpoint
CREATE TABLE "user_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"season_id" uuid,
	"episode_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"is_override" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_media_external";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" varchar(500);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "header_image" varchar(500);--> statement-breakpoint
ALTER TABLE "user_media_state" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_section" ADD CONSTRAINT "profile_section_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hidden_media" ADD CONSTRAINT "user_hidden_media_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_profile_section_user" ON "profile_section" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profile_section_user_position" ON "profile_section" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "idx_user_rating_user" ON "user_rating" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_rating_media" ON "user_rating" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_external" ON "media" USING btree ("external_id","provider","type");