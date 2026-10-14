-- Results remember the profile, scheme and rules version they were graded under, and the grace marks given.
ALTER TABLE "exam_results" ADD COLUMN IF NOT EXISTS "rules_ref" jsonb;--> statement-breakpoint
ALTER TABLE "exam_result_lines" ADD COLUMN IF NOT EXISTS "grace" numeric(5, 2) DEFAULT 0 NOT NULL;
