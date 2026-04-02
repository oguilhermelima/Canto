CREATE TABLE IF NOT EXISTS "pool_translation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pool_item_id" uuid NOT NULL REFERENCES "recommendation_pool"("id") ON DELETE CASCADE,
  "language" varchar(10) NOT NULL REFERENCES "supported_language"("code"),
  "title" varchar(500),
  "overview" text,
  "poster_path" varchar(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_pool_translation_unique" ON "pool_translation" ("pool_item_id", "language");
CREATE INDEX IF NOT EXISTS "idx_pool_translation_pool" ON "pool_translation" ("pool_item_id");
