ALTER TYPE "public"."project_role" ADD VALUE 'ADVISOR';--> statement-breakpoint
CREATE TABLE "proposal_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_role" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_advisor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_project_id_projects_project_id_fk";
--> statement-breakpoint
ALTER TABLE "budget_requests" ALTER COLUMN "current_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "budget_requests" ALTER COLUMN "current_status" SET DEFAULT 'Draft'::text;--> statement-breakpoint
ALTER TABLE "proposal_status_history" ALTER COLUMN "old_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "proposal_status_history" ALTER COLUMN "new_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "current_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "current_status" SET DEFAULT 'Draft'::text;--> statement-breakpoint
ALTER TABLE "routing_rules" ALTER COLUMN "current_status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."proposal_status";--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('Draft', 'Under_Review', 'Needs_Revision', 'Approved', 'Rejected');--> statement-breakpoint
ALTER TABLE "budget_requests" ALTER COLUMN "current_status" SET DEFAULT 'Draft'::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "budget_requests" ALTER COLUMN "current_status" SET DATA TYPE "public"."proposal_status" USING "current_status"::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "proposal_status_history" ALTER COLUMN "old_status" SET DATA TYPE "public"."proposal_status" USING "old_status"::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "proposal_status_history" ALTER COLUMN "new_status" SET DATA TYPE "public"."proposal_status" USING "new_status"::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "current_status" SET DEFAULT 'Draft'::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "current_status" SET DATA TYPE "public"."proposal_status" USING "current_status"::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "routing_rules" ALTER COLUMN "current_status" SET DATA TYPE "public"."proposal_status" USING "current_status"::"public"."proposal_status";--> statement-breakpoint
ALTER TABLE "project_members" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "proposal_program" "project_program";--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "is_funded" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "budget_amount" numeric(12, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "is_editable" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "proposal_program" "project_program";--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "added_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_funded" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "proposal_members" ADD CONSTRAINT "proposal_members_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_members" ADD CONSTRAINT "proposal_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN "proposal_type";--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN "advisor_user_id";--> statement-breakpoint
ALTER TABLE "routing_rules" DROP COLUMN "proposal_type";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "project_type";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "pi_id";--> statement-breakpoint
DROP TYPE "public"."proposal_type";--> statement-breakpoint
DROP TYPE "public"."project_type";