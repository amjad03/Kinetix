-- LMS production pass, part 2: learning paths (courses in order, some required), completion certificates issued
-- through the document register (QR verification), and cmi5 / xAPI: assignable units imported like SCORM packages,
-- the statements they send and the state documents they keep.
CREATE TABLE IF NOT EXISTS "lms_learning_paths" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL CHECK (length("title") BETWEEN 1 AND 160),
  "description" text DEFAULT '' NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL,
  "section_id" uuid REFERENCES "sections"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft', 'published', 'archived')),
  "certificate" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_path_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "path_id" uuid NOT NULL REFERENCES "lms_learning_paths"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "required" boolean DEFAULT true NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_path_steps_uq" ON "lms_path_steps" ("path_id", "course_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_certificates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "course_id" uuid REFERENCES "lms_courses"("id") ON DELETE CASCADE,
  "path_id" uuid REFERENCES "lms_learning_paths"("id") ON DELETE CASCADE,
  "issued_document_id" uuid REFERENCES "issued_documents"("id") ON DELETE SET NULL,
  "serial" text NOT NULL,
  "verify_url" text DEFAULT '' NOT NULL,
  "grade_pct" numeric(5, 2),
  "completed_pct" integer NOT NULL,
  "issued_at" timestamp with time zone NOT NULL,
  "issued_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp with time zone,
  "revoke_reason" text,
  CONSTRAINT "lms_certificates_one_ck" CHECK (("course_id" IS NULL) <> ("path_id" IS NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_certificates_course_uq" ON "lms_certificates" ("student_id", "course_id") WHERE "course_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_certificates_path_uq" ON "lms_certificates" ("student_id", "path_id") WHERE "path_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "scorm_packages" ADD COLUMN IF NOT EXISTS "au_id" text;--> statement-breakpoint
ALTER TABLE "scorm_packages" ADD COLUMN IF NOT EXISTS "mastery_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "scorm_packages" ADD COLUMN IF NOT EXISTS "move_on" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_xapi_statements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "package_id" uuid REFERENCES "scorm_packages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "registration" uuid,
  "verb" text NOT NULL,
  "object_id" text NOT NULL,
  "result_scaled" numeric(6, 4),
  "result_success" boolean,
  "result_completion" boolean,
  "duration" text,
  "statement" jsonb NOT NULL,
  "stored_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_xapi_statements_pkg_idx" ON "lms_xapi_statements" ("package_id", "user_id", "stored_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_xapi_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "package_id" uuid NOT NULL REFERENCES "scorm_packages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "registration" uuid,
  "activity_id" text NOT NULL,
  "state_id" text NOT NULL,
  "content_type" text DEFAULT 'application/json' NOT NULL,
  "content" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_xapi_state_uq" ON "lms_xapi_state" ("package_id", "user_id", "registration", "activity_id", "state_id") NULLS NOT DISTINCT;--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lms_learning_paths', 'lms_path_steps', 'lms_certificates', 'lms_xapi_statements', 'lms_xapi_state'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
