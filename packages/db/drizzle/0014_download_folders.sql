-- Rename library → download_folder
ALTER TABLE "library" RENAME TO "download_folder";
--> statement-breakpoint

-- Add new columns
ALTER TABLE "download_folder" ADD COLUMN "download_path" varchar(500);
--> statement-breakpoint
ALTER TABLE "download_folder" ADD COLUMN "library_path" varchar(500);
--> statement-breakpoint
ALTER TABLE "download_folder" ADD COLUMN "rules" jsonb;
--> statement-breakpoint
ALTER TABLE "download_folder" ADD COLUMN "priority" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Migrate data: copy media_path → library_path
UPDATE "download_folder" SET "library_path" = "media_path" WHERE "media_path" IS NOT NULL;
--> statement-breakpoint

-- Generate rules from type column
UPDATE "download_folder" SET "rules" = '{"operator":"AND","conditions":[{"field":"type","op":"eq","value":"movie"}]}', "priority" = 20 WHERE "type" = 'movies';
--> statement-breakpoint
UPDATE "download_folder" SET "rules" = '{"operator":"AND","conditions":[{"field":"type","op":"eq","value":"show"}]}', "priority" = 10 WHERE "type" = 'shows';
--> statement-breakpoint
UPDATE "download_folder" SET "rules" = '{"operator":"AND","conditions":[{"field":"type","op":"eq","value":"show"},{"operator":"OR","conditions":[{"field":"originCountry","op":"contains_any","value":["JP"]},{"field":"genre","op":"contains_any","value":["Animation"]},{"field":"provider","op":"eq","value":"anilist"}]}]}', "priority" = 0 WHERE "type" = 'animes';
--> statement-breakpoint

-- Drop old columns
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "type";
--> statement-breakpoint
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "media_path";
--> statement-breakpoint
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "container_media_path";
--> statement-breakpoint
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "jellyfin_library_id";
--> statement-breakpoint
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "jellyfin_path";
--> statement-breakpoint
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "plex_library_id";
--> statement-breakpoint
ALTER TABLE "download_folder" DROP COLUMN IF EXISTS "sync_enabled";
--> statement-breakpoint

-- Drop old unique constraint on jellyfin_library_id (if exists)
ALTER TABLE "download_folder" DROP CONSTRAINT IF EXISTS "library_jellyfin_library_id_unique";
--> statement-breakpoint

-- Update FK references from library → download_folder
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_library_id_library_id_fk";
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_library_id_download_folder_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."download_folder"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_item" DROP CONSTRAINT IF EXISTS "sync_item_library_id_library_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_library_id_download_folder_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."download_folder"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Create folder_server_link junction table
CREATE TABLE "folder_server_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"server_type" varchar(20) NOT NULL,
	"server_library_id" varchar(100) NOT NULL,
	"server_library_name" varchar(200),
	"server_path" varchar(500),
	"sync_enabled" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folder_server_link" ADD CONSTRAINT "folder_server_link_folder_id_download_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."download_folder"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_folder_server_link" ON "folder_server_link" USING btree ("folder_id","server_type","server_library_id");
