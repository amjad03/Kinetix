-- Relative (curve) grading and the re-admission scheme.
-- exam_relative_grades: for one subject of one exam session, the class's mean and standard deviation, the moderation
-- shift and the grade cut-offs (marks percent) that replace the absolute bands for that subject when results are
-- processed. curriculum_equivalences: a subject of one curriculum version counted as a subject of another.
-- student_readmissions: a student rejoining after a break, moved to the curriculum version in force at rejoining, with
-- the subjects credited by equivalence and those still to take.
CREATE TABLE IF NOT EXISTS "exam_relative_grades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "candidates" integer NOT NULL,
  "mean" numeric(6, 2) NOT NULL,
  "sd" numeric(6, 2) NOT NULL,
  "shift" numeric(5, 2) NOT NULL DEFAULT 0,
  "cuts" jsonb NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "applied_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_relative_grades_uq" ON "exam_relative_grades" ("session_id", "subject_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_equivalences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "from_version_id" uuid NOT NULL REFERENCES "curriculum_versions"("id") ON DELETE CASCADE,
  "from_code" text NOT NULL,
  "to_version_id" uuid NOT NULL REFERENCES "curriculum_versions"("id") ON DELETE CASCADE,
  "to_code" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_equivalences_uq" ON "curriculum_equivalences" ("from_version_id", "from_code", "to_version_id", "to_code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_readmissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "rejoined_on" date NOT NULL,
  "rejoin_term" smallint NOT NULL,
  "from_version_id" uuid REFERENCES "curriculum_versions"("id") ON DELETE SET NULL,
  "to_version_id" uuid NOT NULL REFERENCES "curriculum_versions"("id") ON DELETE CASCADE,
  "scheme" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "credited" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "to_take" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text NOT NULL DEFAULT '',
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_readmissions_student_idx" ON "student_readmissions" ("student_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_relative_grades', 'curriculum_equivalences', 'student_readmissions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
