-- Admission depth: index marks, rank lists, seat matrix, CAP rounds, agent commission rules and payouts, lead connectors, ad spend.
CREATE TABLE IF NOT EXISTS "admission_index_formulas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "spec" jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "admission_index_formulas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_index_formulas";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_index_formulas"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_index_formulas" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_index_marks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "marks" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "index_mark" numeric(8,2),
  "breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "complete" boolean DEFAULT false NOT NULL,
  "overall_rank" integer,
  "category_rank" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "application_index_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "application_index_marks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "application_index_marks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "application_index_marks" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_seat_matrix" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "option_label" text NOT NULL,
  "category" text DEFAULT 'merit' NOT NULL,
  "seats" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "admission_seat_matrix" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_seat_matrix";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_seat_matrix"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_seat_matrix" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "application_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "application_preferences";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "application_preferences"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "application_preferences" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "round_no" integer NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "admission_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_rounds";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_rounds"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_rounds" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_allotments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "round_id" uuid NOT NULL REFERENCES "admission_rounds"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "option_label" text NOT NULL,
  "seat_category" text NOT NULL,
  "rank" integer NOT NULL,
  "kind" text DEFAULT 'new' NOT NULL,
  "response" text DEFAULT 'pending' NOT NULL,
  "responded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "admission_allotments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "admission_allotments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "admission_allotments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_allotments" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_commission_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "agent_id" uuid REFERENCES "admission_agents"("id") ON DELETE CASCADE,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "flat_paise" bigint DEFAULT 0 NOT NULL,
  "percent_bps" integer DEFAULT 0 NOT NULL,
  "base_paise" bigint DEFAULT 0 NOT NULL,
  "slabs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tds_bps" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_commission_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "agent_commission_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agent_commission_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_commission_rules" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "agent_id" uuid NOT NULL REFERENCES "admission_agents"("id"),
  "gross_paise" bigint NOT NULL,
  "tds_paise" bigint DEFAULT 0 NOT NULL,
  "net_paise" bigint NOT NULL,
  "commission_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "paid_on" date NOT NULL,
  "reference" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "agent_payouts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agent_payouts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_payouts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "secret" text NOT NULL,
  "program_id" uuid REFERENCES "programs"("id") ON DELETE SET NULL,
  "campaign_id" uuid REFERENCES "admission_campaigns"("id") ON DELETE SET NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lead_connectors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lead_connectors";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lead_connectors"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_connectors" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "connector_id" uuid NOT NULL REFERENCES "lead_connectors"("id") ON DELETE CASCADE,
  "external_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "enquiry_id" uuid REFERENCES "enquiries"("id") ON DELETE SET NULL,
  "status" text NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lead_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lead_events";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lead_events"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_events" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "channel" text NOT NULL,
  "day" date NOT NULL,
  "spend_paise" bigint NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lead_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lead_spend";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lead_spend"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_spend" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_index_formulas_cycle_uq" ON "admission_index_formulas" ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_index_marks_app_uq" ON "application_index_marks" ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_index_marks_cycle_idx" ON "application_index_marks" ("cycle_id", "overall_rank");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_seat_matrix_uq" ON "admission_seat_matrix" ("cycle_id", "option_label", "category");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_preferences_app_uq" ON "application_preferences" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_rounds_uq" ON "admission_rounds" ("cycle_id", "round_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_allotments_uq" ON "admission_allotments" ("round_id", "application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_allotments_app_idx" ON "admission_allotments" ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_commission_rules_idx" ON "agent_commission_rules" ("tenant_id", "agent_id", "program_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_payouts_agent_idx" ON "agent_payouts" ("agent_id", "paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_connectors_name_uq" ON "lead_connectors" ("tenant_id", "name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_events_uq" ON "lead_events" ("connector_id", "external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_spend_uq" ON "lead_spend" ("tenant_id", "channel", "day");
