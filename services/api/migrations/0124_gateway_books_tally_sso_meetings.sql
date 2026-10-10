-- Second payment gateway (PayU) settlement reconciliation, accounting books, Tally live sync, SSO (OIDC), meeting attendance.
CREATE TABLE IF NOT EXISTS "settlement_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "source" text NOT NULL,
  "reference" text NOT NULL,
  "settlement_date" date NOT NULL,
  "gross_paise" bigint DEFAULT 0 NOT NULL,
  "fee_paise" bigint DEFAULT 0 NOT NULL,
  "net_paise" bigint DEFAULT 0 NOT NULL,
  "line_count" integer DEFAULT 0 NOT NULL,
  "exception_count" integer DEFAULT 0 NOT NULL,
  "imported_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_batches_ref_uq" ON "settlement_batches" ("tenant_id", "provider", "reference");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlement_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "batch_id" uuid NOT NULL REFERENCES "settlement_batches"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'payment' NOT NULL,
  "provider_payment_id" text NOT NULL,
  "provider_order_id" text,
  "amount_paise" bigint NOT NULL,
  "fee_paise" bigint DEFAULT 0 NOT NULL,
  "net_paise" bigint NOT NULL,
  "status" text NOT NULL,
  "exception_reason" text,
  "fee_payment_id" uuid REFERENCES "fee_payments"("id") ON DELETE SET NULL,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_lines_batch_idx" ON "settlement_lines" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_lines_status_idx" ON "settlement_lines" ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "group_type" text NOT NULL,
  "parent_id" uuid,
  "is_cash_bank" boolean DEFAULT false NOT NULL,
  "opening_paise" bigint DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_accounts_code_uq" ON "acct_accounts" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_vouchers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "financial_year" text NOT NULL,
  "voucher_type" text NOT NULL,
  "number" text NOT NULL,
  "voucher_date" date NOT NULL,
  "narration" text DEFAULT '' NOT NULL,
  "source_type" text,
  "source_id" text,
  "is_closing" boolean DEFAULT false NOT NULL,
  "posted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "voided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_vouchers_number_uq" ON "acct_vouchers" ("tenant_id", "financial_year", "voucher_type", "number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_vouchers_source_uq" ON "acct_vouchers" ("tenant_id", "source_type", "source_id") WHERE "source_type" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_vouchers_date_idx" ON "acct_vouchers" ("tenant_id", "voucher_date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_voucher_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "voucher_id" uuid NOT NULL REFERENCES "acct_vouchers"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "acct_accounts"("id"),
  "debit_paise" bigint DEFAULT 0 NOT NULL,
  "credit_paise" bigint DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_voucher_lines_voucher_idx" ON "acct_voucher_lines" ("voucher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_voucher_lines_account_idx" ON "acct_voucher_lines" ("account_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_fy_closes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "financial_year" text NOT NULL,
  "surplus_paise" bigint NOT NULL,
  "closing_voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL,
  "closed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_fy_closes_uq" ON "acct_fy_closes" ("tenant_id", "financial_year");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tally_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "host" text DEFAULT 'localhost' NOT NULL,
  "port" integer DEFAULT 9000 NOT NULL,
  "company" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tally_settings_tenant_uq" ON "tally_settings" ("tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tally_ledger_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "acct_accounts"("id") ON DELETE CASCADE,
  "tally_ledger" text NOT NULL,
  "tally_parent" text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tally_ledger_map_uq" ON "tally_ledger_map" ("tenant_id", "account_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tally_sync_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "ref_id" uuid NOT NULL,
  "label" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "request_xml" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tally_sync_log_ref_uq" ON "tally_sync_log" ("tenant_id", "kind", "ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tally_sync_log_status_idx" ON "tally_sync_log" ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sso_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "issuer" text NOT NULL,
  "client_id" text NOT NULL,
  "client_secret_enc" text NOT NULL,
  "authorization_endpoint" text NOT NULL,
  "token_endpoint" text NOT NULL,
  "jwks_uri" text NOT NULL,
  "scopes" text DEFAULT 'openid email profile' NOT NULL,
  "allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
  "redirect_allowlist" text[] DEFAULT '{}'::text[] NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sso_providers_tenant_idx" ON "sso_providers" ("tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sso_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider_id" uuid NOT NULL REFERENCES "sso_providers"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "email" text,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sso_identities_uq" ON "sso_identities" ("provider_id", "subject");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sso_login_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_attendance_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "class_meetings"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "minutes" integer DEFAULT 0 NOT NULL,
  "source_name" text,
  "confirmed_status" text,
  "confirmed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "confirmed_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendance_proposals_uq" ON "meeting_attendance_proposals" ("meeting_id", "student_id");--> statement-breakpoint
ALTER TABLE "class_meetings" ADD COLUMN IF NOT EXISTS "participants" jsonb;--> statement-breakpoint
ALTER TABLE "class_meetings" ADD COLUMN IF NOT EXISTS "participants_pulled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settlement_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "settlement_batches";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "settlement_batches"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "settlement_batches" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "settlement_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "settlement_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "settlement_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "settlement_lines" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "acct_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_accounts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_accounts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_accounts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "acct_vouchers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_vouchers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_vouchers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_vouchers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "acct_voucher_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_voucher_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_voucher_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_voucher_lines" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "acct_fy_closes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_fy_closes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_fy_closes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_fy_closes" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "tally_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tally_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tally_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "tally_settings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "tally_ledger_map" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tally_ledger_map";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tally_ledger_map"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "tally_ledger_map" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "tally_sync_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tally_sync_log";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tally_sync_log"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "tally_sync_log" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "sso_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sso_providers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sso_providers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "sso_providers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "sso_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sso_identities";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sso_identities"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "sso_identities" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "sso_login_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sso_login_tickets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sso_login_tickets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "sso_login_tickets" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "meeting_attendance_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "meeting_attendance_proposals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "meeting_attendance_proposals"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "meeting_attendance_proposals" TO kinetix_app;
  END IF;
END $$;
