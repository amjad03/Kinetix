-- Data migration, university result formats, transcripts and the external examiner portal (Linways gap analysis items 1-4).
CREATE TABLE IF NOT EXISTS "migration_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity" text NOT NULL,
  "name" text NOT NULL,
  "mapping" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "migration_mappings_uq" ON "migration_mappings" ("tenant_id", "entity", "name");--> statement-breakpoint
ALTER TABLE "migration_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "migration_mappings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "migration_mappings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "migration_mappings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity" text NOT NULL,
  "file_name" text NOT NULL,
  "fingerprint" text NOT NULL,
  "status" text DEFAULT 'committed' NOT NULL,
  "row_count" integer NOT NULL,
  "created_count" integer DEFAULT 0 NOT NULL,
  "updated_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "reconciliation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "rolled_back_at" timestamp with time zone,
  "rolled_back_by" uuid,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  FOREIGN KEY ("rolled_back_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "migration_batches_fp_uq" ON "migration_batches" ("tenant_id", "entity", "fingerprint") WHERE "status" = 'committed';--> statement-breakpoint
ALTER TABLE "migration_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "migration_batches";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "migration_batches"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "migration_batches" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_batch_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "table_name" text NOT NULL,
  "record_id" uuid NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_batch_records_idx" ON "migration_batch_records" ("batch_id");--> statement-breakpoint
ALTER TABLE "migration_batch_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "migration_batch_records";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "migration_batch_records"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "migration_batch_records" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_marks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "roll_no" text NOT NULL,
  "student_id" uuid,
  "academic_year" text NOT NULL,
  "term" smallint NOT NULL,
  "subject_code" text NOT NULL,
  "subject_name" text DEFAULT '' NOT NULL,
  "credits" numeric(4, 1) DEFAULT 0 NOT NULL,
  "internal_marks" numeric(6, 2),
  "external_marks" numeric(6, 2),
  "max_internal" numeric(6, 2) DEFAULT 0 NOT NULL,
  "max_external" numeric(6, 2) DEFAULT 0 NOT NULL,
  "grade" text,
  "grade_point" numeric(4, 2),
  "result" text DEFAULT 'pass' NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE,
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_marks_uq" ON "legacy_marks" ("tenant_id", "roll_no", "academic_year", "term", "subject_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_marks_student_idx" ON "legacy_marks" ("student_id");--> statement-breakpoint
ALTER TABLE "legacy_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "legacy_marks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "legacy_marks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "legacy_marks" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_attendance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "roll_no" text NOT NULL,
  "student_id" uuid,
  "academic_year" text NOT NULL,
  "term" smallint NOT NULL,
  "classes_held" integer NOT NULL,
  "classes_attended" integer NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE,
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_attendance_uq" ON "legacy_attendance" ("tenant_id", "roll_no", "academic_year", "term");--> statement-breakpoint
ALTER TABLE "legacy_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "legacy_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "legacy_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "legacy_attendance" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_fee_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "roll_no" text NOT NULL,
  "student_id" uuid,
  "academic_year" text NOT NULL,
  "entry_type" text NOT NULL,
  "head" text DEFAULT '' NOT NULL,
  "reference" text NOT NULL,
  "entry_date" date,
  "amount_paise" bigint NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE,
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_fee_entries_uq" ON "legacy_fee_entries" ("tenant_id", "roll_no", "entry_type", "reference", "head");--> statement-breakpoint
ALTER TABLE "legacy_fee_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "legacy_fee_entries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "legacy_fee_entries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "legacy_fee_entries" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "university_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "university" text NOT NULL,
  "config" jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "university_templates_uq" ON "university_templates" ("tenant_id", "code");--> statement-breakpoint
ALTER TABLE "university_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "university_templates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "university_templates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "university_templates" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tabulation_registers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "label" text NOT NULL,
  "source" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("template_id") REFERENCES "university_templates"("id"),
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
ALTER TABLE "tabulation_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tabulation_registers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tabulation_registers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "tabulation_registers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_doc_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "requested_by" uuid NOT NULL,
  "decided_by" uuid,
  "decision_note" text,
  "decided_at" timestamp with time zone,
  "issued_at" timestamp with time zone,
  "serial_no" text,
  "verify_token" text,
  "snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("student_id") REFERENCES "students"("id"),
  FOREIGN KEY ("requested_by") REFERENCES "users"("id"),
  FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_doc_requests_student_idx" ON "academic_doc_requests" ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_doc_requests_serial_uq" ON "academic_doc_requests" ("tenant_id", "serial_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_doc_requests_token_uq" ON "academic_doc_requests" ("verify_token");--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "academic_doc_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "academic_doc_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "academic_doc_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_examiners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "organisation" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_examiners_user_uq" ON "ext_examiners" ("user_id");--> statement-breakpoint
ALTER TABLE "ext_examiners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ext_examiners";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ext_examiners"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ext_examiners" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_examiner_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "examiner_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "role" text NOT NULL,
  "rate_paise" bigint DEFAULT 0 NOT NULL,
  "invite_hash" text,
  "invite_expires_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "status" text DEFAULT 'invited' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("examiner_id") REFERENCES "ext_examiners"("id") ON DELETE CASCADE,
  FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id"),
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_assign_uq" ON "ext_examiner_assignments" ("examiner_id", "session_id", "subject_id", "role");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_assign_invite_uq" ON "ext_examiner_assignments" ("invite_hash");--> statement-breakpoint
ALTER TABLE "ext_examiner_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ext_examiner_assignments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ext_examiner_assignments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ext_examiner_assignments" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_valuation_scripts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assignment_id" uuid NOT NULL,
  "paper_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "script_code" text NOT NULL,
  "max_marks" numeric(6, 2) NOT NULL,
  "marks" numeric(6, 2),
  "remarks" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "valued_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("assignment_id") REFERENCES "ext_examiner_assignments"("id") ON DELETE CASCADE,
  FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_scripts_code_uq" ON "ext_valuation_scripts" ("tenant_id", "script_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_scripts_uq" ON "ext_valuation_scripts" ("assignment_id", "student_id");--> statement-breakpoint
ALTER TABLE "ext_valuation_scripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ext_valuation_scripts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ext_valuation_scripts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ext_valuation_scripts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_question_papers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "setter_assignment_id" uuid,
  "title" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "scrutiny_note" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id"),
  FOREIGN KEY ("setter_assignment_id") REFERENCES "ext_examiner_assignments"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_qp_uq" ON "ext_question_papers" ("session_id", "subject_id");--> statement-breakpoint
ALTER TABLE "ext_question_papers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ext_question_papers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ext_question_papers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ext_question_papers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_remuneration_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "examiner_id" uuid NOT NULL,
  "assignment_id" uuid NOT NULL,
  "units" integer NOT NULL,
  "amount_paise" bigint NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "note" text,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  FOREIGN KEY ("examiner_id") REFERENCES "ext_examiners"("id") ON DELETE CASCADE,
  FOREIGN KEY ("assignment_id") REFERENCES "ext_examiner_assignments"("id") ON DELETE CASCADE,
  FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
ALTER TABLE "ext_remuneration_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ext_remuneration_claims";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ext_remuneration_claims"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ext_remuneration_claims" TO kinetix_app;
  END IF;
END $$;

