-- Supported languages table
CREATE TABLE IF NOT EXISTS "supported_language" (
  "code" varchar(10) PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "native_name" varchar(100) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Seed supported languages
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
ON CONFLICT ("code") DO NOTHING;

-- Clean existing translations that don't match supported languages
DELETE FROM "media_translation" WHERE "language" NOT IN (SELECT "code" FROM "supported_language");
DELETE FROM "season_translation" WHERE "language" NOT IN (SELECT "code" FROM "supported_language");
DELETE FROM "episode_translation" WHERE "language" NOT IN (SELECT "code" FROM "supported_language");

-- Add FKs (after seed so existing data doesn't violate)
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_language_supported_language_code_fk";
ALTER TABLE "user" ADD CONSTRAINT "user_language_supported_language_code_fk"
  FOREIGN KEY ("language") REFERENCES "supported_language"("code");

ALTER TABLE "media_translation" DROP CONSTRAINT IF EXISTS "media_translation_language_supported_language_code_fk";
ALTER TABLE "media_translation" ADD CONSTRAINT "media_translation_language_supported_language_code_fk"
  FOREIGN KEY ("language") REFERENCES "supported_language"("code");

ALTER TABLE "season_translation" DROP CONSTRAINT IF EXISTS "season_translation_language_supported_language_code_fk";
ALTER TABLE "season_translation" ADD CONSTRAINT "season_translation_language_supported_language_code_fk"
  FOREIGN KEY ("language") REFERENCES "supported_language"("code");

ALTER TABLE "episode_translation" DROP CONSTRAINT IF EXISTS "episode_translation_language_supported_language_code_fk";
ALTER TABLE "episode_translation" ADD CONSTRAINT "episode_translation_language_supported_language_code_fk"
  FOREIGN KEY ("language") REFERENCES "supported_language"("code");
