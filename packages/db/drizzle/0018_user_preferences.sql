ALTER TABLE "user" ADD COLUMN "watch_region" varchar(10);
ALTER TABLE "user" ADD COLUMN "direct_search_enabled" boolean NOT NULL DEFAULT true;
