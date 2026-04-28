ALTER TABLE "download_config" ADD COLUMN "singleton" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_download_config_singleton" ON "download_config" USING btree ("singleton");--> statement-breakpoint
ALTER TABLE "download_config" ADD CONSTRAINT "download_config_singleton_check" CHECK ("download_config"."singleton" = true);