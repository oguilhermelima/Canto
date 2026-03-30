CREATE TABLE "blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"indexer" varchar(100),
	"reason" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"media_path" varchar(500),
	"container_media_path" varchar(500),
	"qbit_category" varchar(100),
	"jellyfin_library_id" varchar(100),
	"jellyfin_path" varchar(500),
	"plex_library_id" varchar(100),
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_jellyfin_library_id_unique" UNIQUE("jellyfin_library_id")
);
--> statement-breakpoint
CREATE TABLE "media_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"person_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"character" varchar(500),
	"department" varchar(100),
	"job" varchar(100),
	"profile_path" varchar(255),
	"type" varchar(10) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_video" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"external_key" varchar(255) NOT NULL,
	"site" varchar(50) NOT NULL,
	"name" varchar(500) NOT NULL,
	"type" varchar(50) NOT NULL,
	"official" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_watch_provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_name" varchar(255) NOT NULL,
	"logo_path" varchar(255),
	"type" varchar(10) NOT NULL,
	"region" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(30) NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"qualities" jsonb NOT NULL,
	"cutoff" varchar(50) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" varchar(10) NOT NULL,
	"source_media_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"overview" text,
	"poster_path" varchar(255),
	"backdrop_path" varchar(255),
	"logo_path" varchar(255),
	"release_date" date,
	"vote_average" real,
	"score" real DEFAULT 0 NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_item_id" uuid NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"server_episode_id" varchar(100),
	"resolution" varchar(10),
	"video_codec" varchar(20),
	"audio_codec" varchar(20),
	"container" varchar(10),
	"file_size" bigint,
	"file_path" varchar(1000)
);
--> statement-breakpoint
CREATE TABLE "sync_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"server_item_title" varchar(500) NOT NULL,
	"server_item_path" varchar(1000),
	"server_item_year" integer,
	"tmdb_id" integer,
	"media_id" uuid,
	"result" varchar(20) NOT NULL,
	"reason" varchar(500),
	"source" varchar(20),
	"jellyfin_item_id" varchar(100),
	"plex_rating_key" varchar(100),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_setting" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" varchar(36) NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "user_preference_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "watch_provider_link" (
	"provider_id" integer PRIMARY KEY NOT NULL,
	"provider_name" varchar(200) NOT NULL,
	"search_url_template" text
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "anilist_id" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "anilist_score" real;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "next_air_date" date;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "extras_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "quality_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "source" varchar(20) DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "media_file" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "download_type" varchar(20) DEFAULT 'movie' NOT NULL;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "season_number" integer;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "episode_numbers" jsonb;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "source" varchar(20) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "progress" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "content_path" varchar(1000);--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "file_size" bigint;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "magnet_url" text;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "download_url" text;--> statement-breakpoint
ALTER TABLE "torrent" ADD COLUMN "importing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "blocklist" ADD CONSTRAINT "blocklist_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_credit" ADD CONSTRAINT "media_credit_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_video" ADD CONSTRAINT "media_video_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_watch_provider" ADD CONSTRAINT "media_watch_provider_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_pool" ADD CONSTRAINT "recommendation_pool_source_media_id_media_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_episode" ADD CONSTRAINT "sync_episode_sync_item_id_sync_item_id_fk" FOREIGN KEY ("sync_item_id") REFERENCES "public"."sync_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_blocklist_media" ON "blocklist" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_credit_media" ON "media_credit" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_video_media" ON "media_video" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_wp_media" ON "media_watch_provider" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_wp_region" ON "media_watch_provider" USING btree ("region");--> statement-breakpoint
CREATE INDEX "idx_rec_pool_source" ON "recommendation_pool" USING btree ("source_media_id");--> statement-breakpoint
CREATE INDEX "idx_rec_pool_tmdb" ON "recommendation_pool" USING btree ("tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "idx_rec_pool_score" ON "recommendation_pool" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_sync_episode_item" ON "sync_episode" USING btree ("sync_item_id");--> statement-breakpoint
CREATE INDEX "idx_sync_item_library" ON "sync_item" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "idx_sync_item_result" ON "sync_item" USING btree ("result");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_quality_profile_id_quality_profile_id_fk" FOREIGN KEY ("quality_profile_id") REFERENCES "public"."quality_profile"("id") ON DELETE set null ON UPDATE no action;