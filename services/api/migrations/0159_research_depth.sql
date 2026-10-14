-- Research office depth: bibliographic detail, citations and retraction on publications; office numbers and
-- commercialisation on patents; funding calls for proposals; consultancy with revenue sharing; MoUs and their activities;
-- seed money; faculty recognitions; ethics committee approvals; central instruments and their usage with billing;
-- utilisation certificates of grants; doctoral committee meetings and coursework of research scholars.
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id");--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "isbn" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "volume" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "issue" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "pages" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "url" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "citations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "impact_factor" numeric(7, 3);--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "quartile" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "retracted_on" date;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "retraction_note" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publications_title_year_idx" ON "publications" ("tenant_id", lower("title"), "year");--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id");--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN IF NOT EXISTS "country" text DEFAULT 'India' NOT NULL;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN IF NOT EXISTS "published_on" date;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN IF NOT EXISTS "patent_no" text;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN IF NOT EXISTS "licensed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN IF NOT EXISTS "licence_revenue_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "agency" text NOT NULL,
  "scheme" text DEFAULT '' NOT NULL,
  "title" text NOT NULL,
  "url" text,
  "opens_on" date,
  "internal_deadline" date,
  "deadline" date NOT NULL,
  "max_amount_paise" bigint,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "research_proposals" ADD COLUMN IF NOT EXISTS "call_id" uuid REFERENCES "research_calls"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_consultancies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "client" text NOT NULL,
  "client_contact" text,
  "kind" text DEFAULT 'consultancy' NOT NULL,
  "lead_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "starts_on" date,
  "ends_on" date,
  "contract_paise" bigint DEFAULT 0 NOT NULL,
  "received_paise" bigint DEFAULT 0 NOT NULL,
  "institution_share_pct" numeric(5, 2) DEFAULT 50 NOT NULL,
  "trainees" integer,
  "agreement_ref" text,
  "status" text DEFAULT 'active' NOT NULL,
  "note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_consultancies_starts_idx" ON "research_consultancies" ("tenant_id", "starts_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_mous" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "partner" text NOT NULL,
  "partner_kind" text DEFAULT 'industry' NOT NULL,
  "country" text DEFAULT 'India' NOT NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "signed_on" date NOT NULL,
  "valid_until" date,
  "coordinator_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "document_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_mous_signed_idx" ON "research_mous" ("tenant_id", "signed_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_mou_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "mou_id" uuid NOT NULL REFERENCES "research_mous"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'other' NOT NULL,
  "held_on" date NOT NULL,
  "participants" integer,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_mou_activities_mou_idx" ON "research_mou_activities" ("mou_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_seed_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "applicant_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "requested_paise" bigint DEFAULT 0 NOT NULL,
  "sanctioned_paise" bigint DEFAULT 0 NOT NULL,
  "sanctioned_on" date,
  "duration_months" smallint,
  "utilised_paise" bigint DEFAULT 0 NOT NULL,
  "report_submitted_on" date,
  "outcome" text,
  "status" text DEFAULT 'applied' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_recognitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "level" text DEFAULT 'national' NOT NULL,
  "received_on" date NOT NULL,
  "valid_until" date,
  "amount_paise" bigint DEFAULT 0 NOT NULL,
  "url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_recognitions_user_idx" ON "research_recognitions" ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_ethics_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "committee" text NOT NULL,
  "protocol_no" text NOT NULL,
  "title" text NOT NULL,
  "pi_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "proposal_id" uuid REFERENCES "research_proposals"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "research_projects"("id") ON DELETE SET NULL,
  "submitted_on" date,
  "approved_on" date,
  "expires_on" date,
  "status" text DEFAULT 'pending' NOT NULL,
  "conditions" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_ethics_protocol_uq" ON "research_ethics_approvals" ("tenant_id", "committee", "protocol_no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_equipment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "custodian_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "make_model" text,
  "purchased_on" date,
  "cost_paise" bigint DEFAULT 0 NOT NULL,
  "internal_rate_paise" bigint DEFAULT 0 NOT NULL,
  "external_rate_paise" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'working' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_equipment_code_uq" ON "research_equipment" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_equipment_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "equipment_id" uuid NOT NULL REFERENCES "research_equipment"("id") ON DELETE CASCADE,
  "user_kind" text DEFAULT 'internal' NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "external_name" text,
  "external_org" text,
  "purpose" text DEFAULT '' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "rate_paise" bigint DEFAULT 0 NOT NULL,
  "amount_paise" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'booked' NOT NULL,
  "invoice_ref" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "research_equipment_usage_period_ck" CHECK ("ends_at" > "starts_at")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_equipment_usage_idx" ON "research_equipment_usage" ("equipment_id", "starts_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grant_utilisation_certificates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "grant_id" uuid NOT NULL REFERENCES "research_grants"("id") ON DELETE CASCADE,
  "period_from" date NOT NULL,
  "period_to" date NOT NULL,
  "utilised_paise" bigint DEFAULT 0 NOT NULL,
  "submitted_on" date,
  "reference" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grant_ucs_grant_idx" ON "grant_utilisation_certificates" ("grant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scholar_dc_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scholar_id" uuid NOT NULL REFERENCES "research_scholars"("id") ON DELETE CASCADE,
  "held_on" date NOT NULL,
  "members" text DEFAULT '' NOT NULL,
  "progress" text DEFAULT 'satisfactory' NOT NULL,
  "recommendations" text,
  "next_due_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scholar_dc_meetings_scholar_idx" ON "scholar_dc_meetings" ("scholar_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scholar_coursework" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scholar_id" uuid NOT NULL REFERENCES "research_scholars"("id") ON DELETE CASCADE,
  "course" text NOT NULL,
  "credits" numeric(4, 1) DEFAULT 4 NOT NULL,
  "grade" text,
  "status" text DEFAULT 'enrolled' NOT NULL,
  "completed_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scholar_coursework_uq" ON "scholar_coursework" ("scholar_id", "course");--> statement-breakpoint
ALTER TABLE "research_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_calls";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_calls"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_calls" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_consultancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_consultancies";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_consultancies"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_consultancies" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_mous" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_mous";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_mous"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_mous" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_mou_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_mou_activities";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_mou_activities"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_mou_activities" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_seed_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_seed_grants";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_seed_grants"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_seed_grants" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_recognitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_recognitions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_recognitions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_recognitions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_ethics_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_ethics_approvals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_ethics_approvals"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_ethics_approvals" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_equipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_equipment";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_equipment"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_equipment" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_equipment_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_equipment_usage";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_equipment_usage"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_equipment_usage" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "grant_utilisation_certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "grant_utilisation_certificates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "grant_utilisation_certificates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "grant_utilisation_certificates" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "scholar_dc_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "scholar_dc_meetings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "scholar_dc_meetings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "scholar_dc_meetings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "scholar_coursework" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "scholar_coursework";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "scholar_coursework"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "scholar_coursework" TO kinetix_app;
  END IF;
END $$;
