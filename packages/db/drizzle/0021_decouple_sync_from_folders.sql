-- Create folder_media_path table
CREATE TABLE "folder_media_path" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "folder_id" uuid NOT NULL REFERENCES "download_folder"("id") ON DELETE CASCADE,
  "path" varchar(500) NOT NULL,
  "label" varchar(100),
  "source" varchar(20) DEFAULT 'manual',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "uq_folder_media_path" ON "folder_media_path" ("folder_id", "path");
CREATE INDEX "idx_folder_media_path_folder" ON "folder_media_path" ("folder_id");

-- Seed from existing libraryPath
INSERT INTO "folder_media_path" ("folder_id", "path", "label", "source")
SELECT "id", "library_path", 'Library', 'download'
FROM "download_folder" WHERE "library_path" IS NOT NULL;

-- Seed from server link paths (where different)
INSERT INTO "folder_media_path" ("folder_id", "path", "label", "source")
SELECT fsl."folder_id", fsl."server_path",
  CASE fsl."server_type" WHEN 'jellyfin' THEN 'Jellyfin' ELSE 'Plex' END,
  fsl."server_type"
FROM "folder_server_link" fsl
WHERE fsl."server_path" IS NOT NULL AND fsl."folder_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "folder_media_path" fmp
    WHERE fmp."folder_id" = fsl."folder_id" AND fmp."path" = fsl."server_path"
  );

-- syncItem: make libraryId nullable + add serverLinkId
ALTER TABLE "sync_item" DROP CONSTRAINT "sync_item_library_id_download_folder_id_fk";
ALTER TABLE "sync_item" ALTER COLUMN "library_id" DROP NOT NULL;
ALTER TABLE "sync_item" ADD CONSTRAINT "sync_item_library_id_download_folder_id_fk"
  FOREIGN KEY ("library_id") REFERENCES "download_folder"("id") ON DELETE SET NULL;
ALTER TABLE "sync_item" ADD COLUMN "server_link_id" uuid REFERENCES "folder_server_link"("id") ON DELETE SET NULL;
CREATE INDEX "idx_sync_item_server_link" ON "sync_item" ("server_link_id");

-- Backfill serverLinkId
UPDATE "sync_item" si SET "server_link_id" = (
  SELECT fsl."id" FROM "folder_server_link" fsl
  WHERE fsl."folder_id" = si."library_id" AND fsl."server_type" = si."source"
  LIMIT 1
) WHERE si."library_id" IS NOT NULL AND si."source" IS NOT NULL;

-- folderServerLink: make folderId nullable + update unique index
ALTER TABLE "folder_server_link" DROP CONSTRAINT "folder_server_link_folder_id_download_folder_id_fk";
ALTER TABLE "folder_server_link" ALTER COLUMN "folder_id" DROP NOT NULL;
ALTER TABLE "folder_server_link" ADD CONSTRAINT "folder_server_link_folder_id_download_folder_id_fk"
  FOREIGN KEY ("folder_id") REFERENCES "download_folder"("id") ON DELETE SET NULL;
DROP INDEX "uq_folder_server_link";
CREATE UNIQUE INDEX "uq_server_link_library" ON "folder_server_link" ("server_type", "server_library_id");
