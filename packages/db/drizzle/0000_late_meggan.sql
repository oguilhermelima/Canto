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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extras_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extras_cache_media_id_unique" UNIQUE("media_id")
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
	"number_of_seasons" integer,
	"number_of_episodes" integer,
	"in_production" boolean,
	"networks" jsonb,
	"budget" bigint,
	"revenue" bigint,
	"collection" jsonb,
	"production_companies" jsonb,
	"production_countries" jsonb,
	"in_library" boolean DEFAULT false NOT NULL,
	"library_path" varchar(500),
	"added_at" timestamp with time zone,
	"continuous_download" boolean DEFAULT false NOT NULL,
	"metadata_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"episode_id" uuid,
	"torrent_id" uuid,
	"file_path" varchar(1000) NOT NULL,
	"quality" varchar(20) DEFAULT 'unknown',
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "torrent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" varchar(100),
	"title" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'unknown' NOT NULL,
	"quality" varchar(20) DEFAULT 'unknown' NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
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
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extras_cache" ADD CONSTRAINT "extras_cache_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_torrent_id_torrent_id_fk" FOREIGN KEY ("torrent_id") REFERENCES "public"."torrent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_episode_season_number" ON "episode" USING btree ("season_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_external" ON "media" USING btree ("external_id","provider");--> statement-breakpoint
CREATE INDEX "idx_media_type" ON "media" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_media_in_library" ON "media" USING btree ("in_library");--> statement-breakpoint
CREATE INDEX "idx_media_provider" ON "media" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_media_file_media" ON "media_file" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_media_file_torrent" ON "media_file" USING btree ("torrent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_season_media_number" ON "season" USING btree ("media_id","number");