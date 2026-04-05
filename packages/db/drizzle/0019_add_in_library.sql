ALTER TABLE "media" ADD COLUMN "in_library" boolean NOT NULL DEFAULT false;
UPDATE "media" SET "in_library" = "downloaded";
CREATE INDEX "idx_media_in_library" ON "media" ("in_library");
