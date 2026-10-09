-- PRD sections 1-21 gap close: institution profile (boards, structure model, presets, policies, terminology, per-programme attendance, campus fee structures), identity (4 roles, trusted devices),
-- admissions (correction round, prior education, landing pages), calendars/timetable (scoped calendars, subject frequency, PUC sections), faculties, school learning support
-- (worksheets, remedial, readiness, promotion rules), forums, rubrics, reattempts and integrity flags.
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'external_examiner';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'mentor';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'accreditation_reviewer';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'university_admin';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'correction_requested';--> statement-breakpoint
ALTER TYPE "public"."component_kind" ADD VALUE IF NOT EXISTS 'observation';--> statement-breakpoint
ALTER TYPE "public"."component_kind" ADD VALUE IF NOT EXISTS 'diagnostic';--> statement-breakpoint
ALTER TYPE "public"."component_kind" ADD VALUE IF NOT EXISTS 'skill';--> statement-breakpoint
ALTER TABLE "institution_profiles"
  ADD COLUMN IF NOT EXISTS "institution_type" text,
  ADD COLUMN IF NOT EXISTS "structure_model" text,
  ADD COLUMN IF NOT EXISTS "governance_model" text,
  ADD COLUMN IF NOT EXISTS "fee_model" text,
  ADD COLUMN IF NOT EXISTS "quality_framework" text,
  ADD COLUMN IF NOT EXISTS "languages" jsonb DEFAULT '["en"]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "ai_policy" jsonb DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS "privacy_settings" jsonb DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS "comms_channels" jsonb DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS "terminology" jsonb DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS "preset_key" text;--> statement-breakpoint
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "correction_notes" jsonb DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "correction_due_on" date;--> statement-breakpoint
ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "campus_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "section_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "department_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "source" text,
  ADD COLUMN IF NOT EXISTS "source_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_source_uq" ON "calendar_events" ("tenant_id", "source", "source_ref") WHERE "source" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_frameworks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'national' NOT NULL,
  "authority" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_frameworks_code_uq" ON "curriculum_frameworks" ("tenant_id", "code");--> statement-breakpoint
ALTER TABLE "regulations" ADD COLUMN IF NOT EXISTS "framework_id" uuid REFERENCES "curriculum_frameworks"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faculties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'faculty' NOT NULL,
  "dean_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "institution_id" uuid REFERENCES "affiliated_institutions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "faculties_code_uq" ON "faculties" ("tenant_id", "code");--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "faculty_id" uuid REFERENCES "faculties"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "combination_id" uuid REFERENCES "puc_combinations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "registration_windows" ADD COLUMN IF NOT EXISTS "rule_config" jsonb;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD COLUMN IF NOT EXISTS "fee_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_registrations" ADD COLUMN IF NOT EXISTS "fee_invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN IF NOT EXISTS "university_ref" text;--> statement-breakpoint
ALTER TABLE "registration_windows" DROP CONSTRAINT IF EXISTS "registration_windows_rule_ck";--> statement-breakpoint
ALTER TABLE "registration_windows" ADD CONSTRAINT "registration_windows_rule_ck" CHECK (allocation_rule IN ('cgpa', 'time', 'custom'));--> statement-breakpoint
ALTER TABLE "course_offerings" DROP CONSTRAINT IF EXISTS "course_offerings_category_ck";--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_category_ck" CHECK (category IN ('core', 'elective', 'open_elective', 'skill', 'ability', 'minor', 'major', 'audit', 'additional', 'multidisciplinary', 'vac'));--> statement-breakpoint
ALTER TABLE "lms_items" DROP CONSTRAINT IF EXISTS "lms_items_kind_ck";--> statement-breakpoint
ALTER TABLE "lms_items" ADD CONSTRAINT "lms_items_kind_ck" CHECK (kind IN ('topic', 'video', 'homework', 'assessment', 'file', 'link', 'worksheet', 'case_study', 'simulation', 'virtual_lab', 'ppt', 'pdf'));--> statement-breakpoint
ALTER TABLE "lms_courses" ADD COLUMN IF NOT EXISTS "cloned_from" uuid REFERENCES "lms_courses"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "qb_questions"
  ADD COLUMN IF NOT EXISTS "k_level" text,
  ADD COLUMN IF NOT EXISTS "competency_tags" jsonb DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "skill_tags" jsonb DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "type_config" jsonb;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD COLUMN IF NOT EXISTS "max_attempts" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_boards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'central' NOT NULL,
  "region" text DEFAULT 'India' NOT NULL,
  "medium" text DEFAULT 'English' NOT NULL,
  "grading_scheme" text DEFAULT 'marks' NOT NULL,
  "pass_rules" jsonb DEFAULT '{}' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "school_boards_code_uq" ON "school_boards" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "threshold_pct" integer NOT NULL,
  "lock_hours" integer,
  "note" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_overrides_uq" ON "attendance_overrides" ("tenant_id", "program_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campus_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campus_id" uuid NOT NULL REFERENCES "campuses"("id") ON DELETE CASCADE,
  "fee_model" text,
  "grading_policy" text,
  "settings" jsonb DEFAULT '{}' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campus_settings_uq" ON "campus_settings" ("tenant_id", "campus_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_structures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campus_id" uuid REFERENCES "campuses"("id") ON DELETE CASCADE,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "items" jsonb DEFAULT '[]' NOT NULL,
  "due_in_days" integer DEFAULT 30 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trusted_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_hash" text NOT NULL,
  "label" text DEFAULT '' NOT NULL,
  "platform" text DEFAULT 'web' NOT NULL,
  "trusted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trusted_devices_uq" ON "trusted_devices" ("user_id", "device_hash");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_prior_education" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "level" text DEFAULT 'secondary' NOT NULL,
  "institution" text NOT NULL,
  "board" text,
  "passing_year" smallint,
  "percentage" numeric(5,2),
  "tc_number" text,
  "medium" text,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_prior_education_owner_chk" CHECK ("student_id" IS NOT NULL OR "application_id" IS NOT NULL)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_prior_education_student_idx" ON "student_prior_education" ("student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_landing_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "headline" text NOT NULL,
  "intro" text DEFAULT '' NOT NULL,
  "highlights" jsonb DEFAULT '[]' NOT NULL,
  "faqs" jsonb DEFAULT '[]' NOT NULL,
  "contact_phone" text,
  "contact_email" text,
  "accent_colour" text DEFAULT '#1d4ed8' NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_landing_pages_cycle_uq" ON "admission_landing_pages" ("cycle_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_frequency" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "min_per_week" smallint DEFAULT 1 NOT NULL,
  "max_per_week" smallint DEFAULT 6 NOT NULL,
  "max_per_day" smallint DEFAULT 2 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_frequency_uq" ON "subject_frequency" ("tenant_id", "subject_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_biometric_ids" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "device_user_id" text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_biometric_ids_uq" ON "student_biometric_ids" ("tenant_id", "device_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_biometric_ids_student_uq" ON "student_biometric_ids" ("student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worksheets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'worksheet' NOT NULL,
  "title" text NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "subject_name" text NOT NULL,
  "outcome_id" uuid REFERENCES "learning_outcomes"("id") ON DELETE SET NULL,
  "due_on" date,
  "max_score" numeric(6,2) DEFAULT 10 NOT NULL,
  "levels" jsonb DEFAULT '[]' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worksheets_section_idx" ON "worksheets" ("section_id", "kind");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worksheet_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "worksheet_id" uuid NOT NULL REFERENCES "worksheets"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "score" numeric(6,2),
  "level" text,
  "remarks" text DEFAULT '' NOT NULL,
  "scored_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scored_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worksheet_scores_uq" ON "worksheet_scores" ("worksheet_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "outcome_id" uuid NOT NULL REFERENCES "learning_outcomes"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_topics_uq" ON "outcome_topics" ("outcome_id", "topic_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "remedial_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "subject_name" text NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "outcome_id" uuid REFERENCES "learning_outcomes"("id") ON DELETE SET NULL,
  "topic_id" uuid REFERENCES "topics"("id") ON DELETE SET NULL,
  "section_id" uuid REFERENCES "sections"("id") ON DELETE SET NULL,
  "plan" text NOT NULL,
  "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "due_on" date,
  "status" text DEFAULT 'open' NOT NULL,
  "result_note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  CONSTRAINT "remedial_plans_target_chk" CHECK ("student_id" IS NOT NULL OR "section_id" IS NOT NULL)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "remedial_plans_student_idx" ON "remedial_plans" ("student_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "readiness_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "exam" text NOT NULL,
  "exam_on" date,
  "target_pct" numeric(5,2) DEFAULT 70 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "readiness_targets_uq" ON "readiness_targets" ("student_id", "exam");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "readiness_mocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "exam" text NOT NULL,
  "taken_on" date NOT NULL,
  "score" numeric(7,2) NOT NULL,
  "max_score" numeric(7,2) NOT NULL,
  "breakdown" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "readiness_mocks_student_idx" ON "readiness_mocks" ("student_id", "exam", "taken_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotion_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "min_attendance_pct" integer DEFAULT 75 NOT NULL,
  "subject_pass_pct" integer DEFAULT 35 NOT NULL,
  "max_compartment_subjects" integer DEFAULT 2 NOT NULL,
  "grace_marks" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotion_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "rule_id" uuid REFERENCES "promotion_rules"("id") ON DELETE SET NULL,
  "decision" text NOT NULL,
  "failed_subjects" jsonb DEFAULT '[]' NOT NULL,
  "attendance_pct" numeric(5,2),
  "reasons" jsonb DEFAULT '[]' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "parent_notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promotion_decisions_uq" ON "promotion_decisions" ("academic_year_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_plan_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "lesson_plan_id" uuid NOT NULL REFERENCES "lesson_plans"("id") ON DELETE CASCADE,
  "course_outcome_id" uuid REFERENCES "course_outcomes"("id") ON DELETE CASCADE,
  "learning_outcome_id" uuid REFERENCES "learning_outcomes"("id") ON DELETE CASCADE,
  "activity" text DEFAULT '' NOT NULL,
  "resource" text DEFAULT '' NOT NULL,
  "assessment" text DEFAULT '' NOT NULL,
  CONSTRAINT "lesson_plan_outcomes_one_chk" CHECK (("course_outcome_id" IS NOT NULL) <> ("learning_outcome_id" IS NOT NULL))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_plan_outcomes_plan_idx" ON "lesson_plan_outcomes" ("lesson_plan_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forum_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "body" text NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_post_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_threads_course_idx" ON "forum_threads" ("course_id", "last_post_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forum_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "forum_threads"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_posts_thread_idx" ON "forum_posts" ("thread_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rubrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "scope" text DEFAULT 'general' NOT NULL,
  "criteria" jsonb DEFAULT '[]' NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rubrics_name_uq" ON "rubrics" ("tenant_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rubric_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "rubric_id" uuid NOT NULL REFERENCES "rubrics"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "context_kind" text DEFAULT 'general' NOT NULL,
  "context_id" uuid,
  "selections" jsonb DEFAULT '[]' NOT NULL,
  "total" numeric(7,2) NOT NULL,
  "max_total" numeric(7,2) NOT NULL,
  "scored_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scored_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rubric_scores_student_idx" ON "rubric_scores" ("student_id", "rubric_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reattempt_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "scheme_id" uuid NOT NULL REFERENCES "assessment_schemes"("id") ON DELETE CASCADE,
  "attempt_no" smallint NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reattempt_requests_uq" ON "reattempt_requests" ("student_id", "scheme_id", "attempt_no") WHERE "status" <> 'rejected';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrity_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "context_kind" text NOT NULL,
  "context_id" uuid,
  "kind" text NOT NULL,
  "severity" text DEFAULT 'low' NOT NULL,
  "details" jsonb DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_flags_student_idx" ON "integrity_flags" ("student_id", "status");--> statement-breakpoint
ALTER TABLE "faculties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "faculties";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "faculties"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "faculties" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "school_boards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "school_boards";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "school_boards"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "school_boards" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "attendance_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "attendance_overrides";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attendance_overrides"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_overrides" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "campus_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "campus_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "campus_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "campus_settings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_structures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_structures";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_structures"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_structures" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "trusted_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "trusted_devices";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "trusted_devices"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "trusted_devices" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "student_prior_education" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_prior_education";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_prior_education"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_prior_education" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "admission_landing_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_landing_pages";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_landing_pages"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_landing_pages" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "subject_frequency" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "subject_frequency";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "subject_frequency"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "subject_frequency" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "student_biometric_ids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_biometric_ids";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_biometric_ids"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_biometric_ids" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "worksheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "worksheets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "worksheets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "worksheets" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "worksheet_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "worksheet_scores";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "worksheet_scores"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "worksheet_scores" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "outcome_topics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "outcome_topics";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "outcome_topics"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "outcome_topics" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "remedial_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "remedial_plans";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "remedial_plans"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "remedial_plans" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "readiness_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "readiness_targets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "readiness_targets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "readiness_targets" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "readiness_mocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "readiness_mocks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "readiness_mocks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "readiness_mocks" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "promotion_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "promotion_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "promotion_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "promotion_rules" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "promotion_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "promotion_decisions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "promotion_decisions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "promotion_decisions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "lesson_plan_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lesson_plan_outcomes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lesson_plan_outcomes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lesson_plan_outcomes" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "forum_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "forum_threads";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "forum_threads"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "forum_threads" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "forum_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "forum_posts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "forum_posts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "forum_posts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "rubrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "rubrics";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rubrics"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "rubrics" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "rubric_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "rubric_scores";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rubric_scores"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "rubric_scores" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "reattempt_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "reattempt_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "reattempt_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "reattempt_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "integrity_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "integrity_flags";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "integrity_flags"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "integrity_flags" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "curriculum_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_frameworks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "curriculum_frameworks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "curriculum_frameworks" TO kinetix_app;
  END IF;
END $$;
