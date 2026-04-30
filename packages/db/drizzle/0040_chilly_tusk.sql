-- Dedupe existing rows before adding the unique indexes. Without this the
-- index creation would abort the migration on any prod database that has
-- accumulated duplicates from racing enrichment passes (delete-then-insert
-- is not atomic across concurrent reconciles). Keep the row with the
-- smallest UUIDv7 id — that's the oldest copy.

DELETE FROM "media_credit" a USING "media_credit" b
 WHERE a.id > b.id
   AND a.media_id = b.media_id
   AND a.person_id = b.person_id
   AND a.type = b.type
   AND COALESCE(a.character, '') = COALESCE(b.character, '')
   AND COALESCE(a.job, '') = COALESCE(b.job, '');--> statement-breakpoint

DELETE FROM "media_video" a USING "media_video" b
 WHERE a.id > b.id
   AND a.media_id = b.media_id
   AND a.external_key = b.external_key;--> statement-breakpoint

DELETE FROM "media_watch_provider" a USING "media_watch_provider" b
 WHERE a.id > b.id
   AND a.media_id = b.media_id
   AND a.provider_id = b.provider_id
   AND a.region = b.region
   AND a.type = b.type;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_credit_natural" ON "media_credit" USING btree ("media_id","person_id","type",COALESCE("character", ''),COALESCE("job", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_video_natural" ON "media_video" USING btree ("media_id","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_wp_natural" ON "media_watch_provider" USING btree ("media_id","provider_id","region","type");
