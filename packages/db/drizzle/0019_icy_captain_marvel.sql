ALTER TABLE "list" ADD COLUMN "default_sort_by" varchar(50) DEFAULT 'date_added.desc' NOT NULL;--> statement-breakpoint
ALTER TABLE "list" ADD COLUMN "group_by_status" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "list" ADD COLUMN "hide_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "list" ADD COLUMN "hide_dropped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "list" ADD COLUMN "show_hidden" boolean DEFAULT false NOT NULL;