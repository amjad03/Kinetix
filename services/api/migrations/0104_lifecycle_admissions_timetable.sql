-- Deeper student lifecycle, admissions (entrance tests, quotas, campaigns) and timetable (substitutions, room capacity).
ALTER TABLE "student_lifecycle_events" ADD COLUMN IF NOT EXISTS "approver_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD COLUMN IF NOT EXISTS "return_on" date;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD COLUMN IF NOT EXISTS "certificate_id" uuid REFERENCES "certificates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "capacity" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'classroom' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "utm_source" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "utm_medium" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "channel" text NOT NULL,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "starts_on" date,
  "ends_on" date,
  "budget_paise" bigint DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_campaigns_name_uq" ON "admission_campaigns" ("tenant_id", "name");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "admission_campaigns"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enquiries_campaign_idx" ON "enquiries" ("campaign_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_quotas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "reserved_seats" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_quotas_uq" ON "admission_quotas" ("cycle_id", "category");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrance_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "test_date" date NOT NULL,
  "starts_at" time NOT NULL,
  "duration_minutes" integer DEFAULT 90 NOT NULL,
  "max_score" numeric(7,2) NOT NULL,
  "pass_score" numeric(7,2),
  "venue" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entrance_tests_cycle_idx" ON "entrance_tests" ("cycle_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrance_halls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "test_id" uuid NOT NULL REFERENCES "entrance_tests"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "capacity" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entrance_halls_name_uq" ON "entrance_halls" ("test_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrance_seats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "test_id" uuid NOT NULL REFERENCES "entrance_tests"("id") ON DELETE CASCADE,
  "hall_id" uuid NOT NULL REFERENCES "entrance_halls"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "seat_no" integer NOT NULL,
  "score" numeric(7,2),
  "absent" boolean DEFAULT false NOT NULL,
  "scored_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scored_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entrance_seats_app_uq" ON "entrance_seats" ("test_id", "application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entrance_seats_seat_uq" ON "entrance_seats" ("hall_id", "seat_no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_substitutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "slot_id" uuid NOT NULL REFERENCES "timetable_slots"("id"),
  "date" date NOT NULL,
  "original_teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "substitute_teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text DEFAULT '' NOT NULL,
  "leave_request_id" uuid REFERENCES "leave_requests"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'assigned' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_substitutions_slot_day_uq" ON "teacher_substitutions" ("slot_id", "date") WHERE "status" = 'assigned';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_substitutions_sub_idx" ON "teacher_substitutions" ("substitute_teacher_id", "date");--> statement-breakpoint
ALTER TABLE "teacher_substitutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "teacher_substitutions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "teacher_substitutions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "teacher_substitutions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "entrance_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "entrance_tests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entrance_tests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "entrance_tests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "entrance_halls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "entrance_halls";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entrance_halls"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "entrance_halls" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "entrance_seats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "entrance_seats";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "entrance_seats"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "entrance_seats" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "admission_quotas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_quotas";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_quotas"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_quotas" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "admission_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_campaigns";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_campaigns"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_campaigns" TO kinetix_app;
  END IF;
END $$;
