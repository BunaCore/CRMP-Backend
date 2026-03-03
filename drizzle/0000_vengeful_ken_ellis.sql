CREATE TYPE "public"."fund_release_status" AS ENUM('Pending', 'Released', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."installment_trigger" AS ENUM('Auto', 'Manual');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'deactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('Pending', 'Accepted', 'Rejected', 'Needs_Revision');--> statement-breakpoint
CREATE TYPE "public"."degree_level" AS ENUM('Master', 'PhD', 'NA');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('Draft', 'Submitted', 'Under_Review', 'Partially_Approved', 'Approved', 'Rejected', 'Needs_Revision', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."proposal_type" AS ENUM('Undergraduate', 'Postgraduate', 'Funded_Project', 'Unfunded_Project');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('CREATED', 'STATUS_CHANGED', 'DECISION_MADE', 'BUDGET_RELEASED', 'WORKSPACE_UNLOCKED', 'EVALUATOR_ASSIGNED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('Submission', 'Assigned', 'Decision', 'Comment', 'Revision_Required', 'Budget_Released', 'Workspace_Unlocked');--> statement-breakpoint
CREATE TYPE "public"."ethical_clearance_status" AS ENUM('Pending', 'Approved', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."project_program" AS ENUM('UG', 'PG', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."project_stage" AS ENUM('Submitted', 'Under Review', 'Approved', 'Rejected', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('Funded', 'Non-Funded', 'Undergraduate');--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('MEMBER', 'PI', 'SUPERVISOR', 'EVALUATOR');--> statement-breakpoint
CREATE TABLE "budget_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"percentage" numeric(5, 2),
	"trigger_type" "installment_trigger" DEFAULT 'Auto',
	"release_status" "fund_release_status" DEFAULT 'Pending',
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"ledger_entry_id" uuid
);
--> statement-breakpoint
CREATE TABLE "budget_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"installment_id" uuid,
	"amount_released" numeric(15, 2) NOT NULL,
	"release_date" timestamp with time zone DEFAULT now(),
	"released_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "budget_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"line_index" integer DEFAULT 1,
	"description" varchar(255) NOT NULL,
	"requested_amount" numeric(15, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid,
	"project_id" uuid,
	"requested_by" uuid,
	"total_amount" numeric(15, 2),
	"approved_amount" numeric(15, 2),
	"finance_approved_by" uuid,
	"finance_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"department" text,
	"phone_number" text,
	"university" text,
	"university_id" text,
	"is_external" boolean DEFAULT false,
	"account_status" "account_status" DEFAULT 'deactive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_name" varchar(50) NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now(),
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "proposal_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"routing_rule_id" uuid,
	"step_order" integer NOT NULL,
	"approver_role" varchar(50) NOT NULL,
	"approver_user_id" uuid,
	"decision" "approval_decision" DEFAULT 'Pending',
	"comment" text,
	"decision_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"version_id" uuid,
	"attachment_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposal_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_id" uuid,
	"file_id" uuid,
	"author_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"comment_text" text NOT NULL,
	"anchor_data" jsonb,
	"is_resolved" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposal_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"file_type" varchar(50),
	"checksum" varchar(64),
	"file_size" bigint,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposal_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"old_status" "proposal_status",
	"new_status" "proposal_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"changed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"created_by" uuid,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT false,
	"file_id" uuid,
	"content_json" jsonb,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"abstract" text,
	"proposal_type" "proposal_type" NOT NULL,
	"degree_level" "degree_level" DEFAULT 'NA',
	"research_area" varchar(255),
	"duration_months" integer,
	"advisor_user_id" uuid,
	"current_status" "proposal_status" DEFAULT 'Draft',
	"submitted_at" timestamp with time zone,
	"current_version_id" uuid,
	"project_id" uuid,
	"workspace_unlocked" boolean DEFAULT false,
	"workspace_unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evaluator_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"evaluator_user_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"proposal_approval_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"due_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_type" "proposal_type" NOT NULL,
	"step_order" integer NOT NULL,
	"approver_role" varchar(50) NOT NULL,
	"step_label" varchar(100),
	"is_parallel" boolean DEFAULT false,
	"is_final" boolean DEFAULT false,
	"required" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" varchar(255),
	"body" text,
	"proposal_id" uuid,
	"project_id" uuid,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verification_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"verification_status" varchar(20) DEFAULT 'Pending',
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"role" "project_role",
	"user_id" uuid NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"project_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_title" text NOT NULL,
	"project_type" "project_type" NOT NULL,
	"project_stage" "project_stage" NOT NULL,
	"project_description" text,
	"submission_date" date NOT NULL,
	"proposal_file" text,
	"research_area" text,
	"project_program" "project_program",
	"department" text,
	"duration_months" integer NOT NULL,
	"pi_id" uuid NOT NULL,
	"assigned_evaluator" uuid,
	"ethical_clearance_status" "ethical_clearance_status" NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "budget_installments" ADD CONSTRAINT "budget_installments_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_installments" ADD CONSTRAINT "budget_installments_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_installment_id_budget_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."budget_installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_request_items" ADD CONSTRAINT "budget_request_items_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_finance_approved_by_users_id_fk" FOREIGN KEY ("finance_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_attachment_file_id_proposal_files_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."proposal_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_file_id_proposal_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."proposal_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_files" ADD CONSTRAINT "proposal_files_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_files" ADD CONSTRAINT "proposal_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_status_history" ADD CONSTRAINT "proposal_status_history_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_status_history" ADD CONSTRAINT "proposal_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_file_id_proposal_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."proposal_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_advisor_user_id_users_id_fk" FOREIGN KEY ("advisor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_assignments" ADD CONSTRAINT "evaluator_assignments_evaluator_user_id_users_id_fk" FOREIGN KEY ("evaluator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_assignments" ADD CONSTRAINT "evaluator_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_assignments" ADD CONSTRAINT "evaluator_assignments_proposal_approval_id_proposal_approvals_id_fk" FOREIGN KEY ("proposal_approval_id") REFERENCES "public"."proposal_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_uploads" ADD CONSTRAINT "verification_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_uploads" ADD CONSTRAINT "verification_uploads_file_id_proposal_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."proposal_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_uploads" ADD CONSTRAINT "verification_uploads_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;