-- Curriculum versioning with AI syllabus import; school report cards, PUC streams, competency mastery, houses; affiliated institutions, regulations and convocation.
ALTER TYPE "public"."ai_task" ADD VALUE IF NOT EXISTS 'syllabusImport';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regulations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "year" smallint NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL,
  "authority" text DEFAULT 'Board of Studies' NOT NULL,
  "effective_from" date NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "regulations_name_year_uq" ON "regulations" ("tenant_id", "name", "year");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "regulation_id" uuid REFERENCES "regulations"("id") ON DELETE SET NULL,
  "regulation_year" smallint NOT NULL,
  "version_no" integer NOT NULL,
  "label" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "effective_from" date,
  "supersedes_id" uuid REFERENCES "curriculum_versions"("id") ON DELETE SET NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "bos_ref" text,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_versions_uq" ON "curriculum_versions" ("tenant_id", "program_id", "regulation_year", "version_no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_subjects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "curriculum_versions"("id") ON DELETE CASCADE,
  "term" smallint NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "credits" numeric(4,1) DEFAULT 0 NOT NULL,
  "hours" smallint DEFAULT 0 NOT NULL,
  "ord" smallint DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_subjects_uq" ON "curriculum_subjects" ("version_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "curriculum_subjects"("id") ON DELETE CASCADE,
  "ord" smallint NOT NULL,
  "title" text NOT NULL,
  "hours" smallint DEFAULT 0 NOT NULL,
  "topics" text[] DEFAULT '{}' NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_cos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "curriculum_subjects"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "statement" text NOT NULL,
  "bloom_level" text
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_curriculum_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "curriculum_versions"("id") ON DELETE CASCADE,
  "pinned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_curriculum_pins_uq" ON "student_curriculum_pins" ("tenant_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "syllabus_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "regulation_year" smallint NOT NULL,
  "file_name" text NOT NULL,
  "extracted_chars" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "preview" boolean DEFAULT false NOT NULL,
  "proposal" jsonb NOT NULL,
  "version_id" uuid REFERENCES "curriculum_versions"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
  "term_label" text NOT NULL,
  "remarks" text DEFAULT '' NOT NULL,
  "behaviour_grade" text,
  "promotion_status" text DEFAULT 'pending' NOT NULL,
  "promoted_to" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_cards_uq" ON "report_cards" ("tenant_id", "student_id", "academic_year_id", "term_label");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_card_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "report_card_id" uuid NOT NULL REFERENCES "report_cards"("id") ON DELETE CASCADE,
  "subject_name" text NOT NULL,
  "marks" numeric(6,2) NOT NULL,
  "max_marks" numeric(6,2) NOT NULL,
  "grade" text,
  "remark" text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "co_curricular_grades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "report_card_id" uuid NOT NULL REFERENCES "report_cards"("id") ON DELETE CASCADE,
  "activity" text NOT NULL,
  "grade" text NOT NULL,
  "remark" text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "puc_streams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "puc_streams_uq" ON "puc_streams" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "puc_combinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "stream_id" uuid NOT NULL REFERENCES "puc_streams"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "subjects" jsonb NOT NULL,
  "seats" integer
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "puc_combinations_uq" ON "puc_combinations" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "puc_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
  "combination_id" uuid NOT NULL REFERENCES "puc_combinations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "puc_enrollments_uq" ON "puc_enrollments" ("tenant_id", "student_id", "academic_year_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "puc_marks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
  "subject_name" text NOT NULL,
  "theory" numeric(6,2),
  "practical" numeric(6,2),
  "internal" numeric(6,2),
  "entered_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "puc_marks_uq" ON "puc_marks" ("tenant_id", "student_id", "academic_year_id", "subject_name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'outcome' NOT NULL,
  "grade" smallint NOT NULL,
  "subject_name" text NOT NULL,
  "code" text NOT NULL,
  "statement" text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_outcomes_uq" ON "learning_outcomes" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mastery_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "outcome_id" uuid NOT NULL REFERENCES "learning_outcomes"("id") ON DELETE CASCADE,
  "level" text NOT NULL,
  "evidence" text DEFAULT '' NOT NULL,
  "assessed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assessed_on" date NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mastery_records_uq" ON "mastery_records" ("tenant_id", "student_id", "outcome_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "houses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "colour" text DEFAULT '#1d4ed8' NOT NULL,
  "motto" text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "houses_name_uq" ON "houses" ("tenant_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "is_captain" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "house_members_uq" ON "house_members" ("tenant_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "student_id" uuid REFERENCES "students"("id") ON DELETE SET NULL,
  "points" integer NOT NULL,
  "category" text DEFAULT 'general' NOT NULL,
  "reason" text NOT NULL,
  "awarded_on" date NOT NULL,
  "awarded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "house_points_house_idx" ON "house_points" ("tenant_id", "house_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliated_institutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "model" text DEFAULT 'affiliated' NOT NULL,
  "university" text DEFAULT '' NOT NULL,
  "city" text DEFAULT '' NOT NULL,
  "aishe_code" text,
  "affiliation_valid_to" date,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "affiliated_institutions_uq" ON "affiliated_institutions" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "convocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "held_on" date NOT NULL,
  "graduation_year" smallint NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "convocation_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "convocation_id" uuid NOT NULL REFERENCES "convocations"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'eligible' NOT NULL,
  "cgpa" numeric(5,2),
  "degree_title" text NOT NULL,
  "registered_at" timestamp with time zone,
  "certificate_no" text,
  "issued_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "convocation_candidates_uq" ON "convocation_candidates" ("convocation_id", "student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "convocation_candidates_cert_uq" ON "convocation_candidates" ("tenant_id", "certificate_no") WHERE "certificate_no" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "regulations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "regulations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "regulations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "curriculum_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_versions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "curriculum_versions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "curriculum_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_subjects";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "curriculum_subjects"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "curriculum_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_units";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "curriculum_units"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "curriculum_cos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_cos";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "curriculum_cos"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "student_curriculum_pins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_curriculum_pins";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_curriculum_pins"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "syllabus_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "syllabus_imports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "syllabus_imports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "report_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "report_cards";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_cards"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "report_card_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "report_card_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_card_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "co_curricular_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "co_curricular_grades";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "co_curricular_grades"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "puc_streams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "puc_streams";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "puc_streams"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "puc_combinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "puc_combinations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "puc_combinations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "puc_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "puc_enrollments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "puc_enrollments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "puc_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "puc_marks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "puc_marks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "learning_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "learning_outcomes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "learning_outcomes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "mastery_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mastery_records";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mastery_records"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "houses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "houses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "houses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "house_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "house_members";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "house_members"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "house_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "house_points";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "house_points"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "affiliated_institutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "affiliated_institutions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "affiliated_institutions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "convocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "convocations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "convocations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "convocation_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "convocation_candidates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "convocation_candidates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulations", "curriculum_versions", "curriculum_subjects", "curriculum_units", "curriculum_cos", "student_curriculum_pins", "syllabus_imports", "report_cards", "report_card_lines", "co_curricular_grades", "puc_streams", "puc_combinations", "puc_enrollments", "puc_marks", "learning_outcomes", "mastery_records", "houses", "house_members", "house_points", "affiliated_institutions", "convocations", "convocation_candidates" TO kinetix_app;
  END IF;
END $$;
