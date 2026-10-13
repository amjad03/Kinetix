-- Fees and accounts desk: approval workflows (fee structures, concessions, refunds, write-offs, vouchers), cheques,
-- day-end cash closing, month close, numbering series and module settings.
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "academic_year" text;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "decision_note" text;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "invoice_no" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_invoices_no_uq" ON "fee_invoices" ("tenant_id","invoice_no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_concessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "sponsor_name" text,
  "percent" integer,
  "amount_paise" bigint NOT NULL,
  "applied_paise" bigint DEFAULT 0 NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_concessions_number_uq" ON "fee_concessions" ("tenant_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_concessions_student_idx" ON "fee_concessions" ("student_id");--> statement-breakpoint
ALTER TABLE "fee_concessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_concessions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_concessions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_concessions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_cheques" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_id" uuid NOT NULL REFERENCES "fee_payments"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "cheque_no" text NOT NULL,
  "bank_name" text NOT NULL,
  "cheque_date" date NOT NULL,
  "amount_paise" bigint NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "deposited_on" date,
  "cleared_on" date,
  "bounced_on" date,
  "bounce_reason" text,
  "bounce_charge_paise" bigint DEFAULT 0 NOT NULL,
  "charge_invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_cheques_payment_uq" ON "fee_cheques" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_cheques_status_idx" ON "fee_cheques" ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "fee_cheques" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_cheques";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_cheques"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_cheques" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_refund_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "fee_payments"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "pay_mode" text,
  "pay_reference" text,
  "refund_id" uuid REFERENCES "fee_refunds"("id") ON DELETE SET NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "paid_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_refund_requests_number_uq" ON "fee_refund_requests" ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_refund_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_refund_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_refund_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_write_offs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_write_offs_number_uq" ON "fee_write_offs" ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "fee_write_offs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_write_offs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_write_offs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_write_offs" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_voucher_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "voucher_type" text NOT NULL,
  "voucher_date" date NOT NULL,
  "narration" text DEFAULT '' NOT NULL,
  "lines" jsonb NOT NULL,
  "amount_paise" bigint NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_voucher_requests_number_uq" ON "acct_voucher_requests" ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "acct_voucher_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_voucher_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_voucher_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_voucher_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_cash_closings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "closing_date" date NOT NULL,
  "cashier_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "system_paise" bigint NOT NULL,
  "counted_paise" bigint NOT NULL,
  "receipt_count" integer DEFAULT 0 NOT NULL,
  "denominations" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_cash_closings_uq" ON "fee_cash_closings" ("tenant_id","closing_date","cashier_id");--> statement-breakpoint
ALTER TABLE "fee_cash_closings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_cash_closings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_cash_closings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_cash_closings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_period_closes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period" text NOT NULL,
  "closed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_period_closes_uq" ON "acct_period_closes" ("tenant_id","period");--> statement-breakpoint
ALTER TABLE "acct_period_closes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_period_closes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_period_closes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_period_closes" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_accounts_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "series" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "fee_heads" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "payment_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gateway" text DEFAULT 'razorpay' NOT NULL,
  "mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approvals" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_accounts_settings_uq" ON "fee_accounts_settings" ("tenant_id");--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_accounts_settings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_accounts_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_accounts_settings" TO kinetix_app;
  END IF;
END $$;
