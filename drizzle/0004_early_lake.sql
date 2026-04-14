CREATE INDEX "document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_unique" UNIQUE("workspace_id");--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_version_unq" UNIQUE("document_id","version_number");