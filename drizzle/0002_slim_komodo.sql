ALTER TABLE "chat_members" ADD COLUMN "last_read_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE INDEX "idx_created_at" ON "messages" USING btree ("created_at");