-- The detention list the principal publishes before an examination: a frozen copy of who is detained and who is
-- short but may still be condoned, per programme and term. Hall tickets read the published list (a detained student
-- gets no ticket; a condonable one gets it once condonation brings them over the line). Families are told.
CREATE TABLE IF NOT EXISTS "attendance_detention_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "term" smallint,
  "title" text NOT NULL,
  "as_on" date NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "classes" integer NOT NULL DEFAULT 0,
  "eligible" integer NOT NULL DEFAULT 0,
  "condonable" integer NOT NULL DEFAULT 0,
  "detained" integer NOT NULL DEFAULT 0,
  "prepared_by" uuid NOT NULL REFERENCES "users"("id"),
  "published_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamp with time zone,
  "withdrawn_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "withdrawn_at" timestamp with time zone,
  "withdraw_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_detention_lists_status_ck" CHECK ("status" IN ('draft', 'published', 'withdrawn'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_detention_lists_idx" ON "attendance_detention_lists" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_detention_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "list_id" uuid NOT NULL REFERENCES "attendance_detention_lists"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "status" text NOT NULL,
  "pct" numeric(5, 1),
  "effective_pct" numeric(5, 1),
  "threshold_pct" numeric(5, 1) NOT NULL,
  "short_in" jsonb NOT NULL DEFAULT '[]',
  CONSTRAINT "attendance_detention_entries_status_ck" CHECK ("status" IN ('condonable', 'detained'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_detention_entries_uq" ON "attendance_detention_entries" ("list_id", "student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_detention_entries_student_idx" ON "attendance_detention_entries" ("tenant_id", "student_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_detention_lists', 'attendance_detention_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
