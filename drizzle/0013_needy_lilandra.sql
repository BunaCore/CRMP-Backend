ALTER TYPE "public"."disbursement_status" ADD VALUE 'REJECTED';--> statement-breakpoint
CREATE TABLE "project_defences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scheduled_by" uuid,
	"defence_date" timestamp with time zone NOT NULL,
	"location" varchar(255) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "disbursement_requests" DROP CONSTRAINT "disbursement_requests_clearance_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_approvals" DROP CONSTRAINT "proposal_approvals_attachment_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_comments" DROP CONSTRAINT "proposal_comments_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_versions" DROP CONSTRAINT "proposal_versions_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "evaluation_rubrics" ADD COLUMN "is_individual" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "project_defences" ADD CONSTRAINT "project_defences_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defences" ADD CONSTRAINT "project_defences_scheduled_by_users_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_requests" ADD CONSTRAINT "disbursement_requests_clearance_file_id_files_id_fk" FOREIGN KEY ("clearance_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_attachment_file_id_files_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;