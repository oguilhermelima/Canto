CREATE TABLE "trakt_history_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_connection_id" uuid NOT NULL,
	"local_history_id" uuid,
	"remote_history_id" bigint,
	"synced_direction" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trakt_list_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_connection_id" uuid NOT NULL,
	"trakt_list_id" integer NOT NULL,
	"trakt_list_slug" varchar(255) NOT NULL,
	"local_list_id" uuid NOT NULL,
	"remote_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trakt_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_connection_id" uuid NOT NULL,
	"last_pulled_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_connection" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "user_connection" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trakt_history_sync" ADD CONSTRAINT "trakt_history_sync_user_connection_id_user_connection_id_fk" FOREIGN KEY ("user_connection_id") REFERENCES "public"."user_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_history_sync" ADD CONSTRAINT "trakt_history_sync_local_history_id_user_watch_history_id_fk" FOREIGN KEY ("local_history_id") REFERENCES "public"."user_watch_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_list_link" ADD CONSTRAINT "trakt_list_link_user_connection_id_user_connection_id_fk" FOREIGN KEY ("user_connection_id") REFERENCES "public"."user_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_list_link" ADD CONSTRAINT "trakt_list_link_local_list_id_list_id_fk" FOREIGN KEY ("local_list_id") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_sync_state" ADD CONSTRAINT "trakt_sync_state_user_connection_id_user_connection_id_fk" FOREIGN KEY ("user_connection_id") REFERENCES "public"."user_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trakt_history_sync_local" ON "trakt_history_sync" USING btree ("user_connection_id","local_history_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trakt_history_sync_remote" ON "trakt_history_sync" USING btree ("user_connection_id","remote_history_id");--> statement-breakpoint
CREATE INDEX "idx_trakt_history_sync_connection" ON "trakt_history_sync" USING btree ("user_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trakt_list_link_connection_remote" ON "trakt_list_link" USING btree ("user_connection_id","trakt_list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trakt_list_link_local" ON "trakt_list_link" USING btree ("local_list_id");--> statement-breakpoint
CREATE INDEX "idx_trakt_list_link_connection" ON "trakt_list_link" USING btree ("user_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trakt_sync_state_connection" ON "trakt_sync_state" USING btree ("user_connection_id");