-- Attendance governance (corrections, condonation), institution profile and capability profile, buildings and floors.
CREATE TABLE IF NOT EXISTS "buildings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campus_id" uuid NOT NULL REFERENCES "campuses"("id"),
  "name" text NOT NULL,
  "code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "building_floors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "building_id" uuid NOT NULL REFERENCES "buildings"("id") ON DELETE CASCADE,
  "level" integer NOT NULL,
  "label" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "floor_id" uuid REFERENCES "building_floors"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "timetable_slot_id" uuid NOT NULL REFERENCES "timetable_slots"("id"),
  "date" date NOT NULL,
  "from_status" "attendance_status",
  "to_status" "attendance_status" NOT NULL,
  "reason" text NOT NULL,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_corrections_status_idx" ON "attendance_corrections" ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_condonations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "kind" text NOT NULL,
  "reason" text NOT NULL,
  "document_key" text,
  "document_type" text,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "approved_points" integer DEFAULT 0 NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_condonations_student_idx" ON "attendance_condonations" ("student_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE UNIQUE,
  "legal_name" text,
  "affiliation_body" text,
  "affiliation_no" text,
  "aishe_code" text,
  "naac_grade" text,
  "established_year" integer,
  "address_line" text,
  "city" text,
  "state" text,
  "pincode" text,
  "phone" text,
  "email" text,
  "website" text,
  "academic_model" text DEFAULT 'school' NOT NULL,
  "board_or_university" text,
  "disabled_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "buildings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "buildings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "buildings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "building_floors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "building_floors";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "building_floors"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "building_floors" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "attendance_corrections";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attendance_corrections"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_corrections" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "attendance_condonations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "attendance_condonations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attendance_condonations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_condonations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "institution_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "institution_profiles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "institution_profiles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "institution_profiles" TO kinetix_app;
  END IF;
END $$;
