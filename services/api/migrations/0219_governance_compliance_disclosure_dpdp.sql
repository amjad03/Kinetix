-- Governance pass: the compliance calendar (regulatory deadlines with owners, reminders and recurrence), the mandatory
-- disclosure page (typed lines and a publish switch), outside-portal references on grievances (UGC e-Samadhan), and
-- DPDP grievances and nominations with the date each request must be answered by.
CREATE TABLE IF NOT EXISTS "compliance_deadlines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "authority" text DEFAULT 'other' NOT NULL,
  "framework_key" text,
  "due_on" date NOT NULL,
  "recurrence" text DEFAULT 'none' NOT NULL CHECK ("recurrence" IN ('none', 'monthly', 'quarterly', 'annual')),
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "remind_days" integer[] DEFAULT '{30,7,1}'::integer[] NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'done', 'missed', 'waived')),
  "completed_on" date,
  "reference" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "last_reminded_on" date,
  "reminders_sent" integer DEFAULT 0 NOT NULL,
  "next_id" uuid,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_deadlines_due_idx" ON "compliance_deadlines" ("tenant_id", "status", "due_on");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disclosure_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "section" text NOT NULL CHECK ("section" IN ('about', 'approvals', 'governance', 'academics', 'fees', 'infrastructure', 'other')),
  "label" text NOT NULL,
  "value" text DEFAULT '' NOT NULL,
  "url" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "public" boolean DEFAULT true NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disclosure_items_section_idx" ON "disclosure_items" ("tenant_id", "section", "sort_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disclosure_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "published" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "intro" text DEFAULT '' NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "disclosure_settings_tenant_uq" ON "disclosure_settings" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "external_portal" text;
--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "external_ref" text;
--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "external_ref_on" date;
--> statement-breakpoint
ALTER TABLE "grievance_tickets" DROP CONSTRAINT IF EXISTS "grievance_tickets_portal_ck";
--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD CONSTRAINT "grievance_tickets_portal_ck" CHECK ("external_portal" IS NULL OR "external_portal" IN ('e_samadhan', 'aicte', 'cpgrams', 'university', 'state', 'other'));
--> statement-breakpoint
ALTER TABLE "dpdp_requests" ADD COLUMN IF NOT EXISTS "due_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "dpdp_requests" ADD COLUMN IF NOT EXISTS "nominee" jsonb;
--> statement-breakpoint
-- Requests made before this had no answer-by date: 30 days from when they were made.
UPDATE "dpdp_requests" SET "due_at" = "created_at" + interval '30 days' WHERE "due_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "compliance_deadlines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "compliance_deadlines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "compliance_deadlines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "compliance_deadlines" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "disclosure_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "disclosure_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "disclosure_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "disclosure_items" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "disclosure_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "disclosure_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "disclosure_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "disclosure_settings" TO zynetix_app;
  END IF;
END $$;
