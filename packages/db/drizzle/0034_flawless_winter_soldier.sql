CREATE TABLE "episode_localization" (
	"episode_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"title" varchar(500),
	"overview" text,
	"source" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_localization_episode_id_language_pk" PRIMARY KEY("episode_id","language")
);
--> statement-breakpoint
CREATE TABLE "media_aspect_state" (
	"media_id" uuid NOT NULL,
	"aspect" varchar(20) NOT NULL,
	"scope" varchar(20) DEFAULT '' NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"succeeded_at" timestamp with time zone,
	"outcome" varchar(20) NOT NULL,
	"next_eligible_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consecutive_fails" integer DEFAULT 0 NOT NULL,
	"materialized_source" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_aspect_state_media_id_aspect_scope_pk" PRIMARY KEY("media_id","aspect","scope")
);
--> statement-breakpoint
CREATE TABLE "media_localization" (
	"media_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"title" varchar(500) NOT NULL,
	"overview" text,
	"tagline" varchar(500),
	"poster_path" varchar(255),
	"logo_path" varchar(255),
	"trailer_key" varchar(100),
	"source" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_localization_media_id_language_pk" PRIMARY KEY("media_id","language")
);
--> statement-breakpoint
CREATE TABLE "season_localization" (
	"season_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"name" varchar(200),
	"overview" text,
	"source" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_localization_season_id_language_pk" PRIMARY KEY("season_id","language")
);
--> statement-breakpoint
ALTER TABLE "episode_localization" ADD CONSTRAINT "episode_localization_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_localization" ADD CONSTRAINT "episode_localization_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_aspect_state" ADD CONSTRAINT "media_aspect_state_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_localization" ADD CONSTRAINT "media_localization_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_localization" ADD CONSTRAINT "media_localization_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_localization" ADD CONSTRAINT "season_localization_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_localization" ADD CONSTRAINT "season_localization_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_episode_localization_lang" ON "episode_localization" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_media_aspect_state_eligible" ON "media_aspect_state" USING btree ("next_eligible_at");--> statement-breakpoint
CREATE INDEX "idx_media_localization_lang" ON "media_localization" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_season_localization_lang" ON "season_localization" USING btree ("language");