-- Clubs, committees and campus events.
CREATE TABLE IF NOT EXISTS "clubs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text DEFAULT 'general' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "faculty_coordinator_id" uuid REFERENCES "users"("id"),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "activity_on" date NOT NULL,
  "points" integer DEFAULT 0 NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_activity_attendance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "activity_id" uuid NOT NULL REFERENCES "club_activities"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "points" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "statutory" boolean DEFAULT false NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "committee_id" uuid NOT NULL REFERENCES "committees"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text DEFAULT 'member' NOT NULL,
  "tenure_start" date NOT NULL,
  "tenure_end" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "committee_id" uuid NOT NULL REFERENCES "committees"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "meeting_on" date NOT NULL,
  "agenda" text DEFAULT '' NOT NULL,
  "minutes" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_action_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "committee_meetings"("id") ON DELETE CASCADE,
  "committee_id" uuid NOT NULL REFERENCES "committees"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "due_on" date NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campus_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "event_type" text DEFAULT 'other' NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "capacity" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "audience" text DEFAULT 'all' NOT NULL,
  "fee_paise" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "campus_events"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "registered_by" uuid NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'registered' NOT NULL,
  "qr_token" text NOT NULL,
  "checked_in_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "campus_events"("id") ON DELETE CASCADE,
  "registration_id" uuid NOT NULL REFERENCES "event_registrations"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clubs_name_uq" ON "clubs" ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_members_uq" ON "club_members" ("club_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_members_student_idx" ON "club_members" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_activities_club_idx" ON "club_activities" ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_activity_attendance_uq" ON "club_activity_attendance" ("activity_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "committees_name_uq" ON "committees" ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_members_committee_idx" ON "committee_members" ("committee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_meetings_committee_idx" ON "committee_meetings" ("committee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_action_items_meeting_idx" ON "committee_action_items" ("meeting_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_action_items_owner_idx" ON "committee_action_items" ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_uq" ON "event_registrations" ("event_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_token_uq" ON "event_registrations" ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_feedback_uq" ON "event_feedback" ("registration_id");--> statement-breakpoint
ALTER TABLE "clubs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "clubs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "clubs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "clubs" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "club_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "club_members";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_members"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "club_members" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "club_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "club_activities";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_activities"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "club_activities" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "club_activity_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "club_activity_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_activity_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "club_activity_attendance" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "committees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committees";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committees"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committees" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "committee_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_members";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_members"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_members" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "committee_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_meetings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_meetings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_meetings" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "committee_action_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_action_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_action_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_action_items" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "campus_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "campus_events";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "campus_events"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "campus_events" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "event_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "event_registrations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_registrations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "event_registrations" TO kinetix_app;
  END IF;
END $$;;--> statement-breakpoint
ALTER TABLE "event_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "event_feedback";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_feedback"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "event_feedback" TO kinetix_app;
  END IF;
END $$;;
