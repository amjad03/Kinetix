-- Academic planning: the course master (credits, L-T-P-S hours, type, marks split and pass marks), lab batches and
-- combined classes on timetable periods, draft calendar entries, elective baskets, prerequisites and co-requisites,
-- credit transfers (ABC, SWAYAM, NPTEL), faculty allocation, period structures, special classes and compensatory
-- working days.
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "credits" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "lecture_hours" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "tutorial_hours" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "practical_hours" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "self_study_hours" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "course_type" text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "max_internal" smallint;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "max_external" smallint;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "internal_pass_marks" smallint;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "external_pass_marks" smallint;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "batch" text;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "combined_section_ids" uuid[];--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "elective_baskets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "term" smallint NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'elective' NOT NULL,
  "min_choose" smallint DEFAULT 1 NOT NULL,
  "max_choose" smallint DEFAULT 1 NOT NULL,
  "min_credits" numeric(4, 1),
  "max_credits" numeric(4, 1),
  "notes" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "elective_baskets_name_uq" ON "elective_baskets" ("tenant_id", "program_id", "term", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "elective_basket_subjects" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "basket_id" uuid NOT NULL REFERENCES "elective_baskets"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  PRIMARY KEY ("basket_id", "subject_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_requisites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "requires_subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'prerequisite' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_requisites_uq" ON "subject_requisites" ("subject_id", "requires_subject_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "course_title" text NOT NULL,
  "provider" text DEFAULT '' NOT NULL,
  "external_ref" text DEFAULT '' NOT NULL,
  "credits" numeric(4, 1) NOT NULL,
  "grade" text DEFAULT '' NOT NULL,
  "completed_on" date,
  "term" smallint,
  "mapped_subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transfers_student_idx" ON "credit_transfers" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transfers_status_idx" ON "credit_transfers" ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faculty_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id"),
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'primary' NOT NULL,
  "batch" text,
  "hours_per_week" smallint DEFAULT 0 NOT NULL,
  "from_date" date,
  "to_date" date,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faculty_allocations_teacher_idx" ON "faculty_allocations" ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faculty_allocations_class_idx" ON "faculty_allocations" ("section_id", "subject_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "period_structures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "days" smallint[] DEFAULT '{1,2,3,4,5,6}'::smallint[] NOT NULL,
  "periods" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "period_structures_name_uq" ON "period_structures" ("tenant_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "special_classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'extra' NOT NULL,
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "batch" text,
  "date" date NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "topic" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "special_classes_date_idx" ON "special_classes" ("tenant_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "special_classes_teacher_idx" ON "special_classes" ("teacher_id", "date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "working_day_swaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "follows_weekday" smallint NOT NULL,
  "program_ids" uuid[],
  "reason" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "working_day_swaps_date_uq" ON "working_day_swaps" ("tenant_id", "date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_batches" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "batch" text NOT NULL,
  PRIMARY KEY ("section_id", "student_id")
);--> statement-breakpoint
ALTER TABLE "elective_baskets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "elective_baskets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "elective_baskets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "elective_basket_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "elective_basket_subjects";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "elective_basket_subjects"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "subject_requisites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "subject_requisites";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "subject_requisites"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "credit_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "credit_transfers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "credit_transfers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "faculty_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "faculty_allocations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "faculty_allocations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "period_structures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "period_structures";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "period_structures"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "special_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "special_classes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "special_classes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "working_day_swaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "working_day_swaps";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "working_day_swaps"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "student_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_batches";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_batches"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "elective_baskets", "elective_basket_subjects", "subject_requisites", "credit_transfers", "faculty_allocations", "period_structures", "special_classes", "working_day_swaps", "student_batches" TO zynetix_app;
  END IF;
END $$;
