-- Academics pass: the teaching diary (work-done log). One entry per period actually taught: the topics taken (which
-- also mark syllabus coverage), how it was delivered, how it went against the lesson plan, and the head of
-- department's review.
CREATE TABLE IF NOT EXISTS "teaching_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "timetable_slot_id" uuid REFERENCES "timetable_slots"("id") ON DELETE SET NULL,
  "special_class_id" uuid REFERENCES "special_classes"("id") ON DELETE SET NULL,
  "lesson_plan_id" uuid REFERENCES "lesson_plans"("id") ON DELETE SET NULL,
  "board_session_id" uuid REFERENCES "board_sessions"("id") ON DELETE SET NULL,
  "date" date NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "batch" text,
  "topic_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "delivery" text NOT NULL DEFAULT 'lecture',
  "summary" text NOT NULL DEFAULT '',
  "against_plan" text NOT NULL DEFAULT 'unplanned',
  "deviation_reason" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT 'erp',
  "substitute" boolean NOT NULL DEFAULT false,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_remark" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teaching_logs_period_uq" ON "teaching_logs" ("timetable_slot_id", "date") WHERE "timetable_slot_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teaching_logs_special_uq" ON "teaching_logs" ("special_class_id") WHERE "special_class_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teaching_logs_class_idx" ON "teaching_logs" ("tenant_id", "section_id", "subject_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teaching_logs_teacher_idx" ON "teaching_logs" ("teacher_id", "date");--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "teaching_logs" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON "teaching_logs";
  CREATE POLICY tenant_isolation ON "teaching_logs" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "teaching_logs" TO zynetix_app;
  END IF;
END $$;
