CREATE TYPE "public"."user_program" AS ENUM('UG', 'PG');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_program" "user_program";