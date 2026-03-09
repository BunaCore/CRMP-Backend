ALTER TYPE "public"."notification_type" ADD VALUE 'Examiner_Assigned';--> statement-breakpoint
ALTER TABLE "budget_requests" ADD COLUMN "current_status" "proposal_status" DEFAULT 'Submitted';--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "current_status" "proposal_status";--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "next_role" varchar(50);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "context" jsonb;