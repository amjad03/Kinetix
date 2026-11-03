-- Academics pass: timetable versions (a draft generated or edited away from the live timetable, then published), the
-- draft's periods, and when a teacher cannot be timetabled (a weekly block, optionally only between two dates).
CREATE TABLE IF NOT EXISTS "timetable_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id"),
  "version_no" integer NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "section_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "source" text NOT NULL DEFAULT 'generated',
  "based_on_id" uuid REFERENCES "timetable_versions"("id") ON DELETE SET NULL,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "report" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text NOT NULL DEFAULT '',
  "effective_from" date,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "timetable_versions_no_uq" ON "timetable_versions" ("tenant_id", "version_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_versions_status_idx" ON "timetable_versions" ("tenant_id", "status", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "timetable_version_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "timetable_versions"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "day_of_week" smallint NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "batch" text,
  "combined_section_ids" uuid[],
  "kind" text NOT NULL DEFAULT 'theory',
  "basket_id" uuid REFERENCES "elective_baskets"("id") ON DELETE SET NULL,
  "block_id" uuid,
  "locked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_version_slots_version_idx" ON "timetable_version_slots" ("version_id", "day_of_week", "starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_version_slots_teacher_idx" ON "timetable_version_slots" ("version_id", "teacher_id");--> statement-breakpoint

-- The live period remembers the version that published it.
ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "version_id" uuid REFERENCES "timetable_versions"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "faculty_unavailability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "day_of_week" smallint NOT NULL,
  "starts_at" time,
  "ends_at" time,
  "from_date" date,
  "to_date" date,
  "reason" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faculty_unavailability_teacher_idx" ON "faculty_unavailability" ("teacher_id", "day_of_week");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['timetable_versions', 'timetable_version_slots', 'faculty_unavailability'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
