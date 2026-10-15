-- IQAC depth: the committee and its members' terms, meeting status and venue, action points with an owner, department,
-- NAAC criterion and priority, the year's quality initiatives (the IQAC calendar), AQAR submissions, and tags and a
-- validity date on accreditation evidence.
CREATE TABLE IF NOT EXISTS "iqac_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "designation" text DEFAULT '' NOT NULL,
  "organisation" text,
  "email" text,
  "phone" text,
  "term_from" date NOT NULL,
  "term_to" date,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "iqac_meetings" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "iqac_meetings" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'held' NOT NULL;--> statement-breakpoint
ALTER TABLE "iqac_meetings" ADD COLUMN IF NOT EXISTS "venue" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "iqac_meetings" ADD COLUMN IF NOT EXISTS "present" smallint;--> statement-breakpoint
ALTER TABLE "iqac_actions" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "iqac_actions" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "iqac_actions" ADD COLUMN IF NOT EXISTS "criterion" text;--> statement-breakpoint
ALTER TABLE "iqac_actions" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iqac_initiatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'other' NOT NULL,
  "criterion" text,
  "planned_on" date,
  "held_on" date,
  "participants" integer,
  "coordinator_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "outcome" text,
  "status" text DEFAULT 'planned' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iqac_aqar_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "year" text NOT NULL,
  "due_on" date,
  "submitted_on" date,
  "reference" text,
  "status" text DEFAULT 'preparing' NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "iqac_aqar_year_uq" ON "iqac_aqar_submissions" ("tenant_id", "year");--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD COLUMN IF NOT EXISTS "valid_until" date;--> statement-breakpoint
ALTER TABLE "iqac_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_members";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_members"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_members" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "iqac_initiatives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_initiatives";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_initiatives"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_initiatives" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "iqac_aqar_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "iqac_aqar_submissions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "iqac_aqar_submissions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "iqac_aqar_submissions" TO zynetix_app;
  END IF;
END $$;
