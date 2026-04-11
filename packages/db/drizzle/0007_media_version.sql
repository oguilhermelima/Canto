-- Phase 1: create new tables
CREATE TABLE "media_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid,
	"source" varchar(20) NOT NULL,
	"server_link_id" uuid,
	"server_item_id" varchar(100) NOT NULL,
	"server_item_title" varchar(500) NOT NULL,
	"server_item_path" varchar(1000),
	"server_item_year" integer,
	"resolution" varchar(10),
	"video_codec" varchar(20),
	"audio_codec" varchar(20),
	"container" varchar(10),
	"file_size" bigint,
	"bitrate" bigint,
	"duration_ms" bigint,
	"hdr" varchar(20),
	"primary_audio_lang" varchar(10),
	"audio_langs" text[],
	"subtitle_langs" text[],
	"tmdb_id" integer,
	"result" varchar(20) NOT NULL,
	"reason" varchar(500),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_version_episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"server_episode_id" varchar(100),
	"resolution" varchar(10),
	"video_codec" varchar(20),
	"audio_codec" varchar(20),
	"container" varchar(10),
	"file_size" bigint,
	"bitrate" bigint,
	"duration_ms" bigint,
	"hdr" varchar(20),
	"primary_audio_lang" varchar(10),
	"audio_langs" text[],
	"subtitle_langs" text[],
	"file_path" varchar(1000)
);
--> statement-breakpoint
ALTER TABLE "media_version" ADD CONSTRAINT "media_version_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_version" ADD CONSTRAINT "media_version_server_link_id_folder_server_link_id_fk" FOREIGN KEY ("server_link_id") REFERENCES "public"."folder_server_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_version_episode" ADD CONSTRAINT "media_version_episode_version_id_media_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."media_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Phase 2: backfill media_version from sync_item (jellyfin side)
INSERT INTO "media_version" (
	"id", "media_id", "source", "server_link_id", "server_item_id",
	"server_item_title", "server_item_path", "server_item_year",
	"tmdb_id", "result", "reason", "synced_at", "created_at", "updated_at"
)
SELECT
	gen_random_uuid(),
	"media_id",
	'jellyfin',
	"jellyfin_server_link_id",
	"jellyfin_item_id",
	"server_item_title",
	"server_item_path",
	"server_item_year",
	"tmdb_id",
	"result",
	"reason",
	COALESCE("jellyfin_synced_at", "synced_at"),
	now(),
	now()
FROM "sync_item"
WHERE "jellyfin_item_id" IS NOT NULL;
--> statement-breakpoint

-- Phase 2 (cont): backfill media_version from sync_item (plex side)
INSERT INTO "media_version" (
	"id", "media_id", "source", "server_link_id", "server_item_id",
	"server_item_title", "server_item_path", "server_item_year",
	"tmdb_id", "result", "reason", "synced_at", "created_at", "updated_at"
)
SELECT
	gen_random_uuid(),
	"media_id",
	'plex',
	"plex_server_link_id",
	"plex_rating_key",
	"server_item_title",
	"server_item_path",
	"server_item_year",
	"tmdb_id",
	"result",
	"reason",
	COALESCE("plex_synced_at", "synced_at"),
	now(),
	now()
FROM "sync_item"
WHERE "plex_rating_key" IS NOT NULL;
--> statement-breakpoint

-- Phase 3: backfill media_version_episode from sync_episode. Each sync_episode
-- row belongs to a sync_item; join against the newly-created media_version row
-- by matching (source, server_item_id) to the original sync_item's jellyfin_item_id
-- or plex_rating_key.
INSERT INTO "media_version_episode" (
	"id", "version_id", "season_number", "episode_number", "server_episode_id",
	"resolution", "video_codec", "audio_codec", "container", "file_size", "file_path"
)
SELECT
	gen_random_uuid(),
	mv.id,
	se.season_number,
	se.episode_number,
	se.server_episode_id,
	se.resolution,
	se.video_codec,
	se.audio_codec,
	se.container,
	se.file_size,
	se.file_path
FROM "sync_episode" se
JOIN "sync_item" si ON si.id = se.sync_item_id
JOIN "media_version" mv
	ON mv.source = se.source
	AND (
		(se.source = 'jellyfin' AND mv.server_item_id = si.jellyfin_item_id)
		OR (se.source = 'plex' AND mv.server_item_id = si.plex_rating_key)
	)
WHERE se.source IS NOT NULL;
--> statement-breakpoint

-- Phase 4: drop legacy tables
DROP TABLE "sync_episode" CASCADE;--> statement-breakpoint
DROP TABLE "sync_item" CASCADE;--> statement-breakpoint

-- Phase 5: indexes (created after backfill to avoid constraint violations
-- during INSERTs, though none are expected here)
CREATE UNIQUE INDEX "uq_media_version_source_server_item" ON "media_version" USING btree ("source","server_item_id");--> statement-breakpoint
CREATE INDEX "idx_media_version_media" ON "media_version" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_media_version_result" ON "media_version" USING btree ("result");--> statement-breakpoint
CREATE INDEX "idx_media_version_server_link" ON "media_version" USING btree ("server_link_id");--> statement-breakpoint
CREATE INDEX "idx_media_version_episode_version" ON "media_version_episode" USING btree ("version_id");
