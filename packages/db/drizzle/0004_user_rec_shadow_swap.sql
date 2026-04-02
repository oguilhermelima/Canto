-- Shadow swap: version + active columns for zero-downtime rebuilds
ALTER TABLE "user" ADD COLUMN "recs_version" integer NOT NULL DEFAULT 0;

ALTER TABLE "user_recommendation" ADD COLUMN "version" integer NOT NULL DEFAULT 0;
ALTER TABLE "user_recommendation" ADD COLUMN "active" boolean NOT NULL DEFAULT true;

-- Replace old unique index with version-aware one
DROP INDEX IF EXISTS "idx_user_rec_user_pool";
CREATE UNIQUE INDEX "idx_user_rec_user_pool_ver" ON "user_recommendation" ("user_id", "pool_item_id", "version");

-- Replace user index with active-aware one
DROP INDEX IF EXISTS "idx_user_rec_user";
CREATE INDEX "idx_user_rec_user_active" ON "user_recommendation" ("user_id", "active");
