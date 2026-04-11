CREATE TABLE "list_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"invited_by" varchar(36) NOT NULL,
	"invited_email" varchar(255),
	"invited_user_id" varchar(36),
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "list_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "uq_server_link_library";--> statement-breakpoint
ALTER TABLE "folder_server_link" ADD COLUMN "user_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "list" ADD COLUMN "visibility" varchar(20) DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "list_invitation" ADD CONSTRAINT "list_invitation_list_id_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_invitation" ADD CONSTRAINT "list_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_invitation" ADD CONSTRAINT "list_invitation_invited_user_id_user_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_member" ADD CONSTRAINT "list_member_list_id_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_member" ADD CONSTRAINT "list_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_list_invitation_list" ON "list_invitation" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_list_invitation_token" ON "list_invitation" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_list_member_unique" ON "list_member" USING btree ("list_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_list_member_user" ON "list_member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "folder_server_link" ADD CONSTRAINT "folder_server_link_user_connection_id_user_connection_id_fk" FOREIGN KEY ("user_connection_id") REFERENCES "public"."user_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_server_link_library_user" ON "folder_server_link" USING btree ("server_type","server_library_id","user_connection_id");