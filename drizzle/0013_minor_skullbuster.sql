ALTER TYPE "public"."audit_action" ADD VALUE 'UPDATED' BEFORE 'STATUS_CHANGED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'DELETED' BEFORE 'STATUS_CHANGED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PERMISSION_CHANGED' BEFORE 'DECISION_MADE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'ASSIGNED' BEFORE 'DECISION_MADE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'OTHER';