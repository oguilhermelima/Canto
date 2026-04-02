-- Drop old pool_item_id column from user_recommendation (replaced by media_id)
ALTER TABLE user_recommendation DROP COLUMN IF EXISTS pool_item_id;

-- Drop old unique index and create new one
DROP INDEX IF EXISTS idx_user_rec_user_pool_ver;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rec_user_media_ver ON user_recommendation(user_id, media_id, version);

-- Drop old tables (cascade drops their indexes and FKs)
DROP TABLE IF EXISTS pool_translation CASCADE;
DROP TABLE IF EXISTS recommendation_pool CASCADE;
