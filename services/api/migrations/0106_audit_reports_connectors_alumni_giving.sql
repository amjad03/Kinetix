-- Audit viewer index, custom report builder, connector registry with outbound webhook deliveries, and alumni giving.
CREATE INDEX IF NOT EXISTS "audit_log_tenant_at_idx" ON "audit_log" ("tenant_id", "at" DESC);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "dataset" text NOT NULL,
  "definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_reports_tenant_idx" ON "custom_reports" ("tenant_id", "created_by");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "config_enc" text NOT NULL,
  "config_public" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_test_at" timestamp with time zone,
  "last_test_status" text,
  "last_test_message" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connectors_name_uq" ON "connectors" ("tenant_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "connector_id" uuid NOT NULL REFERENCES "connectors"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "response_status" integer,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "connector_deliveries_status_ck" CHECK (status IN ('pending', 'delivered', 'retrying', 'dead'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connector_deliveries_event_uq" ON "connector_deliveries" ("connector_id", "event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_deliveries_due_idx" ON "connector_deliveries" ("status", "next_attempt_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "goal_paise" bigint DEFAULT 0 NOT NULL,
  "starts_on" date,
  "ends_on" date,
  "status" text DEFAULT 'active' NOT NULL,
  "receipt_note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "alumni_campaigns_status_ck" CHECK (status IN ('active', 'closed'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_pledges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "alumni_campaigns"("id") ON DELETE CASCADE,
  "alumni_id" uuid REFERENCES "alumni_profiles"("id") ON DELETE SET NULL,
  "donor_name" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "pledged_on" date NOT NULL,
  "due_on" date,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "alumni_pledges_amount_ck" CHECK (amount_paise > 0),
  CONSTRAINT "alumni_pledges_status_ck" CHECK (status IN ('open', 'fulfilled', 'cancelled'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alumni_pledges_campaign_idx" ON "alumni_pledges" ("campaign_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_donations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "alumni_campaigns"("id") ON DELETE CASCADE,
  "alumni_id" uuid REFERENCES "alumni_profiles"("id") ON DELETE SET NULL,
  "pledge_id" uuid REFERENCES "alumni_pledges"("id") ON DELETE SET NULL,
  "donor_name" text NOT NULL,
  "donor_pan" text,
  "donor_address" text DEFAULT '' NOT NULL,
  "amount_paise" bigint NOT NULL,
  "mode" text NOT NULL,
  "reference" text,
  "received_on" date NOT NULL,
  "receipt_serial" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "alumni_donations_amount_ck" CHECK (amount_paise > 0),
  CONSTRAINT "alumni_donations_mode_ck" CHECK (mode IN ('cash', 'cheque', 'upi', 'bank_transfer', 'card', 'other'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alumni_donations_serial_uq" ON "alumni_donations" ("tenant_id", "receipt_serial");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alumni_donations_campaign_idx" ON "alumni_donations" ("campaign_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_volunteer_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "starts_on" date,
  "slots" integer,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "alumni_volunteer_opps_status_ck" CHECK (status IN ('open', 'closed'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alumni_volunteer_signups" (
  "opportunity_id" uuid NOT NULL REFERENCES "alumni_volunteer_opportunities"("id") ON DELETE CASCADE,
  "alumni_id" uuid NOT NULL REFERENCES "alumni_profiles"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("opportunity_id", "alumni_id")
);--> statement-breakpoint
ALTER TABLE "custom_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "custom_reports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "custom_reports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "connectors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "connectors";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "connectors"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "connector_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "connector_deliveries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "connector_deliveries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "alumni_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_campaigns";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_campaigns"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "alumni_pledges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_pledges";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_pledges"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "alumni_donations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_donations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_donations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "alumni_volunteer_opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_volunteer_opportunities";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_volunteer_opportunities"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "alumni_volunteer_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "alumni_volunteer_signups";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alumni_volunteer_signups"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "custom_reports", "connectors", "connector_deliveries", "alumni_campaigns", "alumni_pledges", "alumni_donations", "alumni_volunteer_opportunities", "alumni_volunteer_signups" TO kinetix_app;
  END IF;
END $$;
