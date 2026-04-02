ALTER TABLE "media_video" ADD COLUMN IF NOT EXISTS "language" varchar(10);
ALTER TABLE "pool_translation" ADD COLUMN IF NOT EXISTS "trailer_key" varchar(100);
