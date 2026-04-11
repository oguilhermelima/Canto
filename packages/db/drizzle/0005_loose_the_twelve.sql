CREATE TABLE "user_media_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"media_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"server_link_id" uuid,
	"server_item_id" varchar(255),
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_media_library" ADD CONSTRAINT "user_media_library_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_media_library" ADD CONSTRAINT "user_media_library_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_media_library" ADD CONSTRAINT "user_media_library_server_link_id_folder_server_link_id_fk" FOREIGN KEY ("server_link_id") REFERENCES "public"."folder_server_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_media_library_unique" ON "user_media_library" USING btree ("user_id","media_id","source");--> statement-breakpoint
CREATE INDEX "idx_user_media_library_user" ON "user_media_library" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_media_library_media" ON "user_media_library" USING btree ("media_id");