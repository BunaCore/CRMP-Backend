CREATE TYPE "public"."step_type" AS ENUM('APPROVAL', 'VOTE', 'FORM');--> statement-breakpoint
CREATE TYPE "public"."vote_threshold_strategy" AS ENUM('MAJORITY', 'ALL', 'NUMBER');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('TEMP', 'ATTACHED');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" varchar(500) NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"resource_type" varchar(50),
	"resource_id" uuid,
	"purpose" varchar(50),
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" bigint NOT NULL,
	"status" "file_status" DEFAULT 'TEMP',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "step_type" "step_type" DEFAULT 'APPROVAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "vote_json" jsonb;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "submitted_json" jsonb;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "parallel_group_id" uuid;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "step_type" "step_type" DEFAULT 'APPROVAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "vote_threshold" integer;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "vote_threshold_strategy" "vote_threshold_strategy" DEFAULT 'MAJORITY';--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "dynamic_fields_json" jsonb;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;