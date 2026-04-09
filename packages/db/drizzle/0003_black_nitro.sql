CREATE TABLE "user_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"token" text,
	"external_user_id" varchar(255),
	"accessible_libraries" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_media_state" (
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"status" varchar(20),
	"rating" integer,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_media_state_user_id_media_id_pk" PRIMARY KEY("user_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "user_playback_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"episode_id" uuid,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"last_watched_at" timestamp with time zone,
	"source" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "user_watch_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"episode_id" uuid,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(20)
);
--> statement-breakpoint
ALTER TABLE "user_connection" ADD CONSTRAINT "user_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_media_state" ADD CONSTRAINT "user_media_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_media_state" ADD CONSTRAINT "user_media_state_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playback_progress" ADD CONSTRAINT "user_playback_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playback_progress" ADD CONSTRAINT "user_playback_progress_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playback_progress" ADD CONSTRAINT "user_playback_progress_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watch_history" ADD CONSTRAINT "user_watch_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watch_history" ADD CONSTRAINT "user_watch_history_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watch_history" ADD CONSTRAINT "user_watch_history_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_playback_user" ON "user_playback_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_playback_media" ON "user_playback_progress" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_playback_unique" ON "user_playback_progress" USING btree ("user_id","media_id","episode_id");--> statement-breakpoint
CREATE INDEX "idx_user_history_user" ON "user_watch_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_history_media" ON "user_watch_history" USING btree ("media_id");