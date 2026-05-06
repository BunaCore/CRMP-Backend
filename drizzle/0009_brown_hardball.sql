ALTER TABLE "projects" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "public_file_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;