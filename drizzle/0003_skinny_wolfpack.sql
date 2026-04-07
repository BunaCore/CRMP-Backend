ALTER TABLE "proposal_approvals" ADD COLUMN "branch_key" varchar(50);--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD COLUMN "condition_group" varchar(50);--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "branch_key" varchar(50);--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "condition_group" varchar(50);--> statement-breakpoint
ALTER TABLE "routing_rules" ADD COLUMN "branch_condition_json" jsonb;--> statement-breakpoint
ALTER TABLE "routing_rules" DROP COLUMN "current_status";--> statement-breakpoint
ALTER TABLE "routing_rules" DROP COLUMN "next_role";