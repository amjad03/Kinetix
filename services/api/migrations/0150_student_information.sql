-- Student information: the student's own profile (identifiers, personal and category details, address, custom field
-- values), the institution's custom fields, profile change requests, and no-dues clearances with a line per department.
CREATE TABLE IF NOT EXISTS "student_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "admission_no" text,
  "register_no" text,
  "pen_no" text,
  "aadhaar_last4" text,
  "aadhaar_hash" text,
  "date_of_birth" date,
  "gender" text,
  "category" text,
  "religion" text,
  "mother_tongue" text,
  "nationality" text DEFAULT 'Indian' NOT NULL,
  "is_minority" boolean DEFAULT false NOT NULL,
  "disability" text,
  "admission_type" text DEFAULT 'regular' NOT NULL,
  "address_line" text,
  "city" text,
  "district" text,
  "state" text,
  "pincode" text,
  "custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_profiles_student_uq" ON "student_profiles" ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_profiles_admission_no_uq" ON "student_profiles" ("tenant_id", "admission_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_profiles_register_no_uq" ON "student_profiles" ("tenant_id", "register_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_profiles_aadhaar_idx" ON "student_profiles" ("tenant_id", "aadhaar_hash");--> statement-breakpoint
ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_profiles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_profiles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_profiles" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
-- Students who came through admissions start with the date of birth, gender and category they applied with.
INSERT INTO "student_profiles" ("tenant_id", "student_id", "date_of_birth", "gender", "category")
SELECT s."tenant_id", s."id", a."date_of_birth", lower(a."gender"), lower(coalesce(a."category", a."answers"->>'category'))
FROM "students" s JOIN "applications" a ON a."id" = s."application_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_custom_fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "type" text DEFAULT 'text' NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "help" text,
  "view_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "edit_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requestable" boolean DEFAULT true NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_custom_fields_key_uq" ON "student_custom_fields" ("tenant_id", "key");--> statement-breakpoint
ALTER TABLE "student_custom_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_custom_fields";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_custom_fields"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_custom_fields" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "field" text NOT NULL,
  "field_label" text NOT NULL,
  "current_value" text,
  "new_value" text NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_as" text DEFAULT 'staff' NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_change_requests_status_idx" ON "student_change_requests" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_change_requests_student_idx" ON "student_change_requests" ("student_id");--> statement-breakpoint
ALTER TABLE "student_change_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_change_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_change_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_change_requests" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_clearances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "purpose" text DEFAULT 'tc' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_clearances_status_idx" ON "student_clearances" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_clearances_student_idx" ON "student_clearances" ("student_id");--> statement-breakpoint
ALTER TABLE "student_clearances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_clearances";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_clearances"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_clearances" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_clearance_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "clearance_id" uuid NOT NULL REFERENCES "student_clearances"("id") ON DELETE CASCADE,
  "department" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "dues_paise" bigint DEFAULT 0 NOT NULL,
  "finding" text,
  "note" text,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_clearance_items_uq" ON "student_clearance_items" ("clearance_id", "department");--> statement-breakpoint
ALTER TABLE "student_clearance_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_clearance_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_clearance_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_clearance_items" TO zynetix_app;
  END IF;
END $$;
