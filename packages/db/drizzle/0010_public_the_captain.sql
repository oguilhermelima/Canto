CREATE TABLE "home_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"position" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"style" varchar(20) NOT NULL,
	"source_type" varchar(10) NOT NULL,
	"source_key" varchar(50) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "home_section" ADD CONSTRAINT "home_section_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_home_section_user" ON "home_section" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_home_section_user_position" ON "home_section" USING btree ("user_id","position");