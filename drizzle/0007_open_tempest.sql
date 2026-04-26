ALTER TABLE "proposal_approvals" DROP CONSTRAINT "proposal_approvals_attachment_file_id_proposal_files_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_comments" DROP CONSTRAINT "proposal_comments_file_id_proposal_files_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_versions" DROP CONSTRAINT "proposal_versions_file_id_proposal_files_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_attachment_file_id_files_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;