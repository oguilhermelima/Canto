CREATE TABLE "account" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" varchar(255),
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"indexer" varchar(100),
	"reason" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"download_path" varchar(500),
	"library_path" varchar(500),
	"qbit_category" varchar(100),
	"rules" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"note" text,
	"admin_note" text,
	"resolved_by" varchar(36),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"external_id" integer,
	"title" varchar(500),
	"overview" text,
	"air_date" date,
	"runtime" integer,
	"still_path" varchar(255),
	"vote_average" real,
	"absolute_number" integer,
	"finale_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"title" varchar(500),
	"overview" text
);
--> statement-breakpoint
CREATE TABLE "folder_media_path" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"path" varchar(500) NOT NULL,
	"label" varchar(100),
	"source" varchar(20) DEFAULT 'manual',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_server_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_type" varchar(20) NOT NULL,
	"server_library_id" varchar(100) NOT NULL,
	"server_library_name" varchar(200),
	"server_path" varchar(500),
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"content_type" varchar(20),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36),
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"type" varchar(20) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(10) NOT NULL,
	"external_id" integer NOT NULL,
	"provider" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"original_title" varchar(500),
	"overview" text,
	"tagline" varchar(500),
	"release_date" date,
	"year" integer,
	"last_air_date" date,
	"status" varchar(50),
	"genres" jsonb DEFAULT '[]'::jsonb,
	"genre_ids" jsonb DEFAULT '[]'::jsonb,
	"content_rating" varchar(20),
	"original_language" varchar(10),
	"spoken_languages" jsonb,
	"origin_country" jsonb,
	"vote_average" real,
	"vote_count" integer,
	"popularity" real,
	"runtime" integer,
	"poster_path" varchar(255),
	"backdrop_path" varchar(255),
	"logo_path" varchar(255),
	"imdb_id" varchar(20),
	"tvdb_id" integer,
	"number_of_seasons" integer,
	"number_of_episodes" integer,
	"in_production" boolean,
	"networks" jsonb,
	"budget" bigint,
	"revenue" bigint,
	"collection" jsonb,
	"production_companies" jsonb,
	"production_countries" jsonb,
	"library_id" uuid,
	"in_library" boolean DEFAULT false NOT NULL,
	"downloaded" boolean DEFAULT false NOT NULL,
	"library_path" varchar(500),
	"added_at" timestamp with time zone,
	"continuous_download" boolean DEFAULT false NOT NULL,
	"next_air_date" date,
	"extras_updated_at" timestamp with time zone,
	"quality_profile_id" uuid,
	"processing_status" varchar(20) DEFAULT 'ready' NOT NULL,
	"metadata_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "media_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"episode_id" uuid,
	"torrent_id" uuid,
	"file_path" varchar(1000) NOT NULL,
	"quality" varchar(20) DEFAULT 'unknown',
	"source" varchar(20) DEFAULT 'unknown',
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_recommendation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"source_media_id" uuid NOT NULL,
	"source_type" varchar(20) DEFAULT 'recommendation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"title" varchar(500),
	"overview" text,
	"tagline" varchar(500),
	"poster_path" varchar(255),
	"logo_path" varchar(255),
	"trailer_key" varchar(100)
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
	"language" varchar(10),
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
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"external_id" integer,
	"name" varchar(255),
	"overview" text,
	"air_date" date,
	"poster_path" varchar(255),
	"episode_count" integer,
	"season_type" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"name" varchar(200),
	"overview" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "supported_language" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"native_name" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"library_id" uuid,
	"server_link_id" uuid,
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
CREATE TABLE "torrent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid,
	"hash" varchar(100),
	"title" varchar(500) NOT NULL,
	"download_type" varchar(20) DEFAULT 'movie' NOT NULL,
	"season_number" integer,
	"episode_numbers" jsonb,
	"status" varchar(20) DEFAULT 'unknown' NOT NULL,
	"quality" varchar(20) DEFAULT 'unknown' NOT NULL,
	"source" varchar(20) DEFAULT 'unknown' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"content_path" varchar(1000),
	"file_size" bigint,
	"magnet_url" text,
	"download_url" text,
	"imported" boolean DEFAULT false NOT NULL,
	"importing" boolean DEFAULT false NOT NULL,
	"import_attempts" integer DEFAULT 0 NOT NULL,
	"import_method" varchar(10),
	"usenet" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "torrent_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" varchar(255),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"language" varchar(10) DEFAULT 'en-US' NOT NULL,
	"watch_region" varchar(10),
	"direct_search_enabled" boolean DEFAULT true NOT NULL,
	"recs_version" integer DEFAULT 0 NOT NULL,
	"recs_updated_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" varchar(36) NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "user_preference_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "user_recommendation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_provider_link" (
	"provider_id" integer PRIMARY KEY NOT NULL,
	"provider_name" varchar(200) NOT NULL,
	"search_url_template" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocklist" ADD CONSTRAINT "blocklist_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_request" ADD CONSTRAINT "download_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_request" ADD CONSTRAINT "download_request_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_request" ADD CONSTRAINT "download_request_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_translation" ADD CONSTRAINT "episode_translation_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_translation" ADD CONSTRAINT "episode_translation_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_media_path" ADD CONSTRAINT "folder_media_path_folder_id_download_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."download_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list" ADD CONSTRAINT "list_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_item" ADD CONSTRAINT "list_item_list_id_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_item" ADD CONSTRAINT "list_item_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_library_id_download_folder_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."download_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_quality_profile_id_quality_profile_id_fk" FOREIGN KEY ("quality_profile_id") REFERENCES "public"."quality_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_credit" ADD CONSTRAINT "media_credit_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_torrent_id_torrent_id_fk" FOREIGN KEY ("torrent_id") REFERENCES "public"."torrent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_recommendation" ADD CONSTRAINT "media_recommendation_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_recommendation" ADD CONSTRAINT "media_recommendation_source_media_id_media_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_translation" ADD CONSTRAINT "media_translation_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_translation" ADD CONSTRAINT "media_translation_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_video" ADD CONSTRAINT "media_video_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_watch_provider" ADD CONSTRAINT "media_watch_provider_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_translation" ADD CONSTRAINT "season_translation_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_translation" ADD CONSTRAINT "season_translation_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_episode" ADD CONSTRAINT "sync_episode_sync_item_id_sync_item_id_fk" FOREIGN KEY ("sync_item_id") REFERENCES "public"."sync_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_library_id_download_folder_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."download_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_server_link_id_folder_server_link_id_fk" FOREIGN KEY ("server_link_id") REFERENCES "public"."folder_server_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrent" ADD CONSTRAINT "torrent_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_language_supported_language_code_fk" FOREIGN KEY ("language") REFERENCES "public"."supported_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD CONSTRAINT "user_recommendation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD CONSTRAINT "user_recommendation_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_blocklist_media" ON "blocklist" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_request_user" ON "download_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_request_status" ON "download_request" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_request_user_media" ON "download_request" USING btree ("user_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_episode_season_number" ON "episode" USING btree ("season_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_episode_translation_unique" ON "episode_translation" USING btree ("episode_id","language");--> statement-breakpoint
CREATE INDEX "idx_episode_translation_episode" ON "episode_translation" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_folder_media_path" ON "folder_media_path" USING btree ("folder_id","path");--> statement-breakpoint
CREATE INDEX "idx_folder_media_path_folder" ON "folder_media_path" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_server_link_library" ON "folder_server_link" USING btree ("server_type","server_library_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_user_slug" ON "list" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "idx_list_type" ON "list" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_item_unique" ON "list_item" USING btree ("list_id","media_id");--> statement-breakpoint
CREATE INDEX "idx_list_item_media" ON "list_item" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_external" ON "media" USING btree ("external_id","provider");--> statement-breakpoint
CREATE INDEX "idx_media_type" ON "media" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_media_in_library" ON "media" USING btree ("in_library");--> statement-breakpoint
CREATE INDEX "idx_media_downloaded" ON "media" USING btree ("downloaded");--> statement-breakpoint
CREATE INDEX "idx_media_provider" ON "media" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_credit_media" ON "media_credit" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_media_file_media" ON "media_file" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_media_file_torrent" ON "media_file" USING btree ("torrent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_rec_unique" ON "media_recommendation" USING btree ("media_id","source_media_id");--> statement-breakpoint
CREATE INDEX "idx_media_rec_source" ON "media_recommendation" USING btree ("source_media_id");--> statement-breakpoint
CREATE INDEX "idx_media_rec_media" ON "media_recommendation" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_translation_unique" ON "media_translation" USING btree ("media_id","language");--> statement-breakpoint
CREATE INDEX "idx_media_translation_media" ON "media_translation" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_video_media" ON "media_video" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_wp_media" ON "media_watch_provider" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_wp_region" ON "media_watch_provider" USING btree ("region");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_season_media_number" ON "season" USING btree ("media_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_season_translation_unique" ON "season_translation" USING btree ("season_id","language");--> statement-breakpoint
CREATE INDEX "idx_season_translation_season" ON "season_translation" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_sync_episode_item" ON "sync_episode" USING btree ("sync_item_id");--> statement-breakpoint
CREATE INDEX "idx_sync_item_library" ON "sync_item" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "idx_sync_item_result" ON "sync_item" USING btree ("result");--> statement-breakpoint
CREATE INDEX "idx_sync_item_server_link" ON "sync_item" USING btree ("server_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_rec_user_media_ver" ON "user_recommendation" USING btree ("user_id","media_id","version");--> statement-breakpoint
CREATE INDEX "idx_user_rec_user_active" ON "user_recommendation" USING btree ("user_id","active");--> statement-breakpoint
INSERT INTO "supported_language" ("code", "name", "native_name") VALUES
  ('en-US', 'English', 'English'),
  ('pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)'),
  ('pt-PT', 'Portuguese (Portugal)', 'Português (Portugal)'),
  ('es-ES', 'Spanish', 'Español'),
  ('fr-FR', 'French', 'Français'),
  ('de-DE', 'German', 'Deutsch'),
  ('it-IT', 'Italian', 'Italiano'),
  ('ja-JP', 'Japanese', '日本語'),
  ('ko-KR', 'Korean', '한국어'),
  ('zh-CN', 'Chinese (Simplified)', '中文（简体）'),
  ('ru-RU', 'Russian', 'Русский'),
  ('ar-SA', 'Arabic', 'العربية'),
  ('hi-IN', 'Hindi', 'हिन्दी'),
  ('nl-NL', 'Dutch', 'Nederlands'),
  ('pl-PL', 'Polish', 'Polski'),
  ('sv-SE', 'Swedish', 'Svenska'),
  ('tr-TR', 'Turkish', 'Türkçe'),
  ('th-TH', 'Thai', 'ไทย')
ON CONFLICT DO NOTHING;
