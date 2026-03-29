ALTER TABLE "proposal_approvals" ADD COLUMN "is_active" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "current_step_order" integer DEFAULT 0;