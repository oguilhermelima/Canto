ALTER TABLE "quality_profile" RENAME TO "download_profile";--> statement-breakpoint
ALTER TABLE "download_folder" RENAME COLUMN "quality_profile_id" TO "download_profile_id";--> statement-breakpoint
ALTER TABLE "media" RENAME COLUMN "quality_profile_id" TO "download_profile_id";--> statement-breakpoint
ALTER TABLE "download_folder" DROP CONSTRAINT "download_folder_quality_profile_id_quality_profile_id_fk";
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_quality_profile_id_quality_profile_id_fk";
--> statement-breakpoint
ALTER TABLE "download_folder" ADD CONSTRAINT "download_folder_download_profile_id_download_profile_id_fk" FOREIGN KEY ("download_profile_id") REFERENCES "public"."download_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_download_profile_id_download_profile_id_fk" FOREIGN KEY ("download_profile_id") REFERENCES "public"."download_profile"("id") ON DELETE set null ON UPDATE no action;