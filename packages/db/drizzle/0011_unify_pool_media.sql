-- 1. Add trailer_key to media_translation
ALTER TABLE media_translation ADD COLUMN IF NOT EXISTS trailer_key varchar(100);

-- 2. Create media_recommendation junction table
CREATE TABLE IF NOT EXISTS media_recommendation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  source_media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  source_type varchar(20) NOT NULL DEFAULT 'recommendation',
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_rec_unique ON media_recommendation(media_id, source_media_id);
CREATE INDEX IF NOT EXISTS idx_media_rec_source ON media_recommendation(source_media_id);
CREATE INDEX IF NOT EXISTS idx_media_rec_media ON media_recommendation(media_id);

-- 3. Alter user_recommendation: add media_id column (will replace pool_item_id)
ALTER TABLE user_recommendation ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media(id) ON DELETE CASCADE;
