ALTER TABLE "proposal_approvals" ADD COLUMN "dynamic_fields_json" jsonb;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "vote_threshold" integer;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "vote_threshold_strategy" varchar(50);