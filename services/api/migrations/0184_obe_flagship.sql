-- OBE flagship: question-wise marks tagged to course outcomes, attainment policies with history (institution, programme
-- and course), the accreditation framework of each programme, the CO approval workflow (teacher, head of department,
-- OBE coordinator, IQAC), OBE coordinator assignments, curricular gaps and content beyond the syllabus, batch-wise
-- attainment, programme-outcome questions and OBE kinds on feedback surveys, LMS quiz questions tagged to a CO, and the
-- action-taken report of an improvement action.
CREATE TABLE IF NOT EXISTS "assessment_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "no" text NOT NULL,
  "part" text DEFAULT '' NOT NULL,
  "max_marks" numeric(6, 2) NOT NULL,
  "bloom_level" text,
  "ord" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assessment_questions_max_ck" CHECK ("max_marks" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_questions_uq" ON "assessment_questions" ("assessment_id", "no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_question_cos" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "assessment_questions"("id") ON DELETE CASCADE,
  "co_id" uuid NOT NULL REFERENCES "course_outcomes"("id") ON DELETE CASCADE,
  "weight" numeric(5, 2) DEFAULT 1 NOT NULL,
  CONSTRAINT "assessment_question_cos_pk" PRIMARY KEY ("question_id", "co_id"),
  CONSTRAINT "assessment_question_cos_weight_ck" CHECK ("weight" > 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_question_cos_co_idx" ON "assessment_question_cos" ("co_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_marks" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "assessment_questions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "marks" numeric(6, 2),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "question_marks_pk" PRIMARY KEY ("question_id", "student_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_marks_assessment_idx" ON "question_marks" ("assessment_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obe_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "config" jsonb NOT NULL,
  "note" text,
  "effective_from_year_id" uuid REFERENCES "academic_years"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "obe_policies_scope_ck" CHECK ("scope" IN ('institution', 'program', 'subject'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "obe_policies_uq" ON "obe_policies" ("tenant_id", "scope", "program_id", "subject_id", "version") NULLS NOT DISTINCT;--> statement-breakpoint
INSERT INTO "obe_policies" ("tenant_id", "scope", "program_id", "version", "config", "note", "created_by", "created_at")
  SELECT c."tenant_id", 'program', c."program_id", 1, c."config", 'Rules in force before policy history', c."updated_by", c."updated_at" FROM "obe_configs" c
  ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obe_programs" (
  "program_id" uuid PRIMARY KEY NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "framework" text DEFAULT 'naac' NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "obe_programs_framework_ck" CHECK ("framework" IN ('nba_tier1', 'nba_tier2', 'nba_management', 'nba_pharmacy', 'naac', 'custom'))
);--> statement-breakpoint
ALTER TABLE "co_sets" ADD COLUMN IF NOT EXISTS "review_stage" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "co_sets" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "co_sets" ADD COLUMN IF NOT EXISTS "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "co_sets" SET "review_stage" = 'approved' WHERE "status" IN ('active', 'retired') AND "review_stage" = 'draft';--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "co_sets" ADD CONSTRAINT "co_sets_review_stage_ck" CHECK ("review_stage" IN ('draft', 'hod', 'coordinator', 'iqac', 'approved', 'returned'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "co_set_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "co_set_id" uuid NOT NULL REFERENCES "co_sets"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "decision" text NOT NULL,
  "comment" text,
  "co_id" uuid REFERENCES "course_outcomes"("id") ON DELETE SET NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "co_set_reviews_decision_ck" CHECK ("decision" IN ('submitted', 'approved', 'returned', 'comment', 'activated'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_set_reviews_set_idx" ON "co_set_reviews" ("co_set_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obe_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE CASCADE,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "obe_assignments_role_ck" CHECK ("role" IN ('coordinator', 'course_coordinator'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "obe_assignments_uq" ON "obe_assignments" ("program_id", "user_id", "role", "subject_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obe_curriculum_gaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL,
  "academic_year_id" uuid REFERENCES "academic_years"("id") ON DELETE SET NULL,
  "kind" text DEFAULT 'gap' NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "outcome_codes" text[] DEFAULT '{}'::text[] NOT NULL,
  "method" text,
  "held_on" date,
  "resource_person" text,
  "beneficiaries" integer,
  "status" text DEFAULT 'planned' NOT NULL,
  "evidence_url" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "obe_curriculum_gaps_kind_ck" CHECK ("kind" IN ('gap', 'beyond_syllabus')),
  CONSTRAINT "obe_curriculum_gaps_status_ck" CHECK ("status" IN ('planned', 'done'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "obe_curriculum_gaps_program_idx" ON "obe_curriculum_gaps" ("program_id", "academic_year_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obe_batch_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "batch" text NOT NULL,
  "entry_year_id" uuid NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "target_id" uuid NOT NULL,
  "code" text NOT NULL,
  "direct" numeric(5, 2),
  "indirect" numeric(5, 2),
  "combined" numeric(5, 2),
  "target" numeric(5, 2) NOT NULL,
  "gap" numeric(5, 2),
  "met" boolean NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "computed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "obe_batch_snapshots_idx" ON "obe_batch_snapshots" ("program_id", "entry_year_id", "computed_at");--> statement-breakpoint
ALTER TABLE "survey_questions" ADD COLUMN IF NOT EXISTS "outcome_id" uuid REFERENCES "program_outcomes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "obe_kind" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid REFERENCES "academic_years"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lms_quiz_questions" ADD COLUMN IF NOT EXISTS "co_id" uuid REFERENCES "course_outcomes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "action_taken" text;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "taken_on" date;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment_questions', 'assessment_question_cos', 'question_marks', 'obe_policies', 'obe_programs', 'co_set_reviews', 'obe_assignments', 'obe_curriculum_gaps', 'obe_batch_snapshots'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
