CREATE TYPE "public"."account_status" AS ENUM('active', 'deactive', 'suspended');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "university" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "university_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_status" "account_status" DEFAULT 'deactive' NOT NULL;