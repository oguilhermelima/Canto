-- Multi-language support: translation tables + user language preference

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "language" varchar(10) NOT NULL DEFAULT 'en-US';

-- Media translations
CREATE TABLE IF NOT EXISTS "media_translation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "language" varchar(10) NOT NULL,
  "title" varchar(500),
  "overview" text,
  "tagline" varchar(500),
  "poster_path" varchar(255),
  "logo_path" varchar(255)
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_translation_unique" ON "media_translation" ("media_id", "language");
CREATE INDEX IF NOT EXISTS "idx_media_translation_media" ON "media_translation" ("media_id");

-- Season translations
CREATE TABLE IF NOT EXISTS "season_translation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "season_id" uuid NOT NULL REFERENCES "season"("id") ON DELETE CASCADE,
  "language" varchar(10) NOT NULL,
  "name" varchar(200),
  "overview" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_season_translation_unique" ON "season_translation" ("season_id", "language");
CREATE INDEX IF NOT EXISTS "idx_season_translation_season" ON "season_translation" ("season_id");

-- Episode translations
CREATE TABLE IF NOT EXISTS "episode_translation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "episode_id" uuid NOT NULL REFERENCES "episode"("id") ON DELETE CASCADE,
  "language" varchar(10) NOT NULL,
  "title" varchar(500),
  "overview" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_episode_translation_unique" ON "episode_translation" ("episode_id", "language");
CREATE INDEX IF NOT EXISTS "idx_episode_translation_episode" ON "episode_translation" ("episode_id");
