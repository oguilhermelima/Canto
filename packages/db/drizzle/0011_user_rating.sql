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
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_rating" ADD CONSTRAINT "user_rating_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_user_rating_user" ON "user_rating" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_user_rating_media" ON "user_rating" USING btree ("media_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_rating_media" ON "user_rating" ("user_id", "media_id") WHERE "season_id" IS NULL AND "episode_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_rating_season" ON "user_rating" ("user_id", "media_id", "season_id") WHERE "season_id" IS NOT NULL AND "episode_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_rating_episode" ON "user_rating" ("user_id", "media_id", "episode_id") WHERE "episode_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "user_rating" ("user_id", "media_id", "rating", "is_override")
SELECT "user_id", "media_id", "rating", true
FROM "user_media_state"
WHERE "rating" IS NOT NULL AND "rating" > 0;
