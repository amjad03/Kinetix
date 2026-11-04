-- Research pass, part 1: faculty research profiles (ORCID, Scopus, Web of Science, Google Scholar, Vidwan), a DOI
-- cache so a look-up works while the registry is unreachable, where a publication's details came from, research
-- centres, funded-project depth (agency kind, overhead, budget heads, fund releases by instalment, the budget head of
-- each expense) and incentive schemes with claims.
CREATE TABLE IF NOT EXISTS "research_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "orcid" text,
  "scopus_author_id" text,
  "wos_researcher_id" text,
  "google_scholar_id" text,
  "vidwan_id" text,
  "irins_url" text,
  "areas" text DEFAULT '' NOT NULL,
  "scopus_h_index" smallint,
  "wos_h_index" smallint,
  "scholar_h_index" smallint,
  "scholar_citations" integer,
  "metrics_on" date,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_profiles_user_uq" ON "research_profiles" ("tenant_id", "user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_profiles_orcid_uq" ON "research_profiles" ("tenant_id", "orcid") WHERE "orcid" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "research_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_profiles";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_profiles"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_profiles" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_doi_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "doi" text NOT NULL,
  "record" jsonb NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_doi_cache_uq" ON "research_doi_cache" ("tenant_id", lower("doi"));--> statement-breakpoint
ALTER TABLE "research_doi_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_doi_cache";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_doi_cache"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_doi_cache" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "metadata_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ugc_care_group" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publications_title_key_idx" ON "publications" ("tenant_id", (regexp_replace(lower("title"), '[^a-z0-9]+', '', 'g')));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_centres" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "head_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recognised_by" text DEFAULT '' NOT NULL,
  "recognition_ref" text,
  "recognised_on" date,
  "valid_until" date,
  "areas" text DEFAULT '' NOT NULL,
  "facilities" text,
  "status" text DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_centres_code_uq" ON "research_centres" ("tenant_id", "code");--> statement-breakpoint
ALTER TABLE "research_centres" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_centres";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_centres"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_centres" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "research_projects" ADD COLUMN IF NOT EXISTS "centre_id" uuid REFERENCES "research_centres"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "research_grants" ADD COLUMN IF NOT EXISTS "agency_kind" text DEFAULT 'government' NOT NULL;--> statement-breakpoint
-- Grants on record keep the split NAAC 3.1 used before (by the agency's name).
UPDATE "research_grants" SET "agency_kind" = 'non_government' WHERE "agency" !~* '(ugc|dst|serb|anrf|dbt|csir|icssr|icmr|icar|aicte|drdo|isro|barc|meity|mhrd|moe|ministry|government|govt|department of|state council|kscst|nbhm|dae|ichr)';--> statement-breakpoint
ALTER TABLE "research_grants" ADD COLUMN IF NOT EXISTS "overhead_pct" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_expenses" ADD COLUMN IF NOT EXISTS "budget_head" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_grant_heads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "grant_id" uuid NOT NULL REFERENCES "research_grants"("id") ON DELETE CASCADE,
  "head" text NOT NULL,
  "sanctioned_paise" bigint DEFAULT 0 NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "research_grant_heads_amount_ck" CHECK ("sanctioned_paise" >= 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_grant_heads_uq" ON "research_grant_heads" ("grant_id", "head");--> statement-breakpoint
ALTER TABLE "research_grant_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_grant_heads";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_grant_heads"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_grant_heads" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_grant_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "grant_id" uuid NOT NULL REFERENCES "research_grants"("id") ON DELETE CASCADE,
  "instalment" smallint NOT NULL,
  "released_on" date NOT NULL,
  "amount_paise" bigint NOT NULL,
  "reference" text,
  "received_on" date,
  "note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "research_grant_releases_amount_ck" CHECK ("amount_paise" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_grant_releases_uq" ON "research_grant_releases" ("grant_id", "instalment");--> statement-breakpoint
ALTER TABLE "research_grant_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_grant_releases";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_grant_releases"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_grant_releases" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_incentive_schemes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "kind" text DEFAULT 'publication' NOT NULL,
  "rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cap_per_year_paise" bigint DEFAULT 0 NOT NULL,
  "valid_from" date,
  "valid_until" date,
  "active" boolean DEFAULT true NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "research_incentive_schemes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_incentive_schemes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_incentive_schemes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_incentive_schemes" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_incentive_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scheme_id" uuid NOT NULL REFERENCES "research_incentive_schemes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "publication_id" uuid REFERENCES "publications"("id") ON DELETE CASCADE,
  "patent_id" uuid REFERENCES "patents"("id") ON DELETE CASCADE,
  "basis" text DEFAULT '' NOT NULL,
  "amount_paise" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'claimed' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "paid_on" date,
  "payment_ref" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "research_incentive_claims_subject_ck" CHECK (("publication_id" IS NOT NULL)::int + ("patent_id" IS NOT NULL)::int = 1)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_incentive_claims_pub_uq" ON "research_incentive_claims" ("scheme_id", "user_id", "publication_id") WHERE "publication_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_incentive_claims_pat_uq" ON "research_incentive_claims" ("scheme_id", "user_id", "patent_id") WHERE "patent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_incentive_claims_user_idx" ON "research_incentive_claims" ("tenant_id", "user_id");--> statement-breakpoint
ALTER TABLE "research_incentive_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "research_incentive_claims";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "research_incentive_claims"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "research_incentive_claims" TO zynetix_app;
  END IF;
END $$;
