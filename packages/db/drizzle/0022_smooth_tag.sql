ALTER TABLE "download_folder" ADD COLUMN "quality_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "quality_profile" ADD COLUMN "flavor" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_profile" ADD COLUMN "allowed_formats" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_profile" ADD COLUMN "cutoff_quality" varchar(20);--> statement-breakpoint
ALTER TABLE "quality_profile" ADD COLUMN "cutoff_source" varchar(20);--> statement-breakpoint
ALTER TABLE "quality_profile" ADD COLUMN "min_total_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_profile" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "download_folder" ADD CONSTRAINT "download_folder_quality_profile_id_quality_profile_id_fk" FOREIGN KEY ("quality_profile_id") REFERENCES "public"."quality_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_profile" DROP COLUMN "qualities";--> statement-breakpoint
ALTER TABLE "quality_profile" DROP COLUMN "cutoff";