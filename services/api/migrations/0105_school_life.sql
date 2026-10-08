-- School life: diary, parent-teacher meetings, early years milestones and observations, health records.
CREATE TABLE IF NOT EXISTS "diary_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "entry_date" date NOT NULL,
  "classwork" text DEFAULT '' NOT NULL,
  "homework_note" text DEFAULT '' NOT NULL,
  "notice" text DEFAULT '' NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diary_entries_section_idx" ON "diary_entries" ("tenant_id", "section_id", "entry_date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diary_acks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entry_id" uuid NOT NULL REFERENCES "diary_entries"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "guardian_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diary_acks_entry_student_uq" ON "diary_acks" ("entry_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ptm_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "event_date" date NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ptm_events_status_ck" CHECK (status IN ('open', 'closed'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ptm_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "ptm_events"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "student_id" uuid REFERENCES "students"("id"),
  "booked_by" uuid REFERENCES "users"("id"),
  "booked_at" timestamp with time zone,
  "reminder_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ptm_slots_teacher_start_uq" ON "ptm_slots" ("event_id", "teacher_id", "starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ptm_slots_child_teacher_uq" ON "ptm_slots" ("event_id", "teacher_id", "student_id") WHERE "student_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ey_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "age_band" text NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ey_milestones_domain_ck" CHECK (domain IN ('physical', 'language', 'cognitive', 'social_emotional', 'creative'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ey_milestones_uq" ON "ey_milestones" ("tenant_id", "domain", "age_band", "title");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ey_milestone_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "milestone_id" uuid NOT NULL REFERENCES "ey_milestones"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ey_milestone_status_ck" CHECK (status IN ('emerging', 'developing', 'achieved'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ey_milestone_status_uq" ON "ey_milestone_status" ("student_id", "milestone_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ey_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "milestone_id" uuid REFERENCES "ey_milestones"("id"),
  "domain" text NOT NULL,
  "note" text NOT NULL,
  "photo_key" text,
  "status" text,
  "observed_on" date NOT NULL,
  "observed_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ey_observations_student_idx" ON "ey_observations" ("tenant_id", "student_id", "observed_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "blood_group" text,
  "allergies" text[] DEFAULT '{}'::text[] NOT NULL,
  "conditions" text[] DEFAULT '{}'::text[] NOT NULL,
  "medications" text[] DEFAULT '{}'::text[] NOT NULL,
  "emergency_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "health_profiles_student_uq" ON "health_profiles" ("student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_visits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "visited_at" timestamp with time zone NOT NULL,
  "complaint" text NOT NULL,
  "action" text DEFAULT '' NOT NULL,
  "sent_home" boolean DEFAULT false NOT NULL,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_visits_student_idx" ON "health_visits" ("tenant_id", "student_id", "visited_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_vaccinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "vaccine" text NOT NULL,
  "dose" text DEFAULT '' NOT NULL,
  "given_on" date NOT NULL,
  "next_due_on" date,
  "notes" text DEFAULT '' NOT NULL,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_vaccinations_student_idx" ON "health_vaccinations" ("tenant_id", "student_id");--> statement-breakpoint
ALTER TABLE "diary_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "diary_entries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "diary_entries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "diary_acks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "diary_acks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "diary_acks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ptm_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ptm_events";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ptm_events"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ptm_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ptm_slots";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ptm_slots"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ey_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ey_milestones";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ey_milestones"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ey_milestone_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ey_milestone_status";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ey_milestone_status"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ey_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ey_observations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ey_observations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "health_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "health_profiles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "health_profiles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "health_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "health_visits";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "health_visits"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "health_vaccinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "health_vaccinations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "health_vaccinations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "diary_entries", "diary_acks", "ptm_events", "ptm_slots", "ey_milestones", "ey_milestone_status", "ey_observations", "health_profiles", "health_visits", "health_vaccinations" TO kinetix_app;
  END IF;
END $$;
