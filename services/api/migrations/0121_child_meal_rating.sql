ALTER TABLE "canteen_feedback" ADD COLUMN IF NOT EXISTS "child_key" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;--> statement-breakpoint
UPDATE "canteen_feedback" SET "child_key" = "student_id" WHERE "student_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "canteen_feedback_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canteen_feedback_uq" ON "canteen_feedback" ("user_id", "meal_date", "meal", "child_key");
