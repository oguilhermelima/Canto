-- Add per-user recommendation tracking
ALTER TABLE "user" ADD COLUMN "recs_updated_at" timestamp with time zone;

CREATE TABLE "user_recommendation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "pool_item_id" uuid NOT NULL REFERENCES "recommendation_pool"("id") ON DELETE CASCADE,
  "weight" real NOT NULL DEFAULT 1.0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "idx_user_rec_user_pool" ON "user_recommendation" ("user_id", "pool_item_id");
CREATE INDEX "idx_user_rec_user" ON "user_recommendation" ("user_id");
