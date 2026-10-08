-- Smartboard AI: new AI tasks and the past-exam question bank behind exam-frequency badges.
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'boardSummary';--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'lecture';--> statement-breakpoint
ALTER TYPE "ai_task" ADD VALUE IF NOT EXISTS 'selectAsk';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "past_exam_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "question" text NOT NULL,
  "exam" text NOT NULL,
  "year" integer NOT NULL,
  "marks" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "past_exam_questions_subject_idx" ON "past_exam_questions" ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "past_exam_questions_trgm_idx" ON "past_exam_questions" USING gin ("question" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "past_exam_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "past_exam_questions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "past_exam_questions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "past_exam_questions" TO kinetix_app;
  END IF;
END $$;
