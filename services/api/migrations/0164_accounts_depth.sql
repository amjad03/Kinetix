-- Accounts depth: funds kept as separate books (trust, college, hostel), each voucher's fund and department, bank
-- account details on cash/bank ledgers, bank statements imported line by line and matched to vouchers (bank
-- reconciliation), the gateway settlement's bank credit, and how a department's budget is enforced.
CREATE TABLE IF NOT EXISTS "acct_funds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_funds_code_uq" ON "acct_funds" ("tenant_id","code");--> statement-breakpoint
ALTER TABLE "acct_funds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_funds";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_funds"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_funds" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "acct_vouchers" ADD COLUMN IF NOT EXISTS "fund_id" uuid REFERENCES "acct_funds"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "acct_vouchers" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_vouchers_fund_idx" ON "acct_vouchers" ("tenant_id","fund_id");--> statement-breakpoint
ALTER TABLE "acct_voucher_requests" ADD COLUMN IF NOT EXISTS "fund_id" uuid REFERENCES "acct_funds"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "acct_voucher_requests" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "acct_voucher_requests" ADD COLUMN IF NOT EXISTS "budget_note" text;--> statement-breakpoint
ALTER TABLE "acct_accounts" ADD COLUMN IF NOT EXISTS "bank_name" text;--> statement-breakpoint
ALTER TABLE "acct_accounts" ADD COLUMN IF NOT EXISTS "account_no" text;--> statement-breakpoint
ALTER TABLE "acct_accounts" ADD COLUMN IF NOT EXISTS "ifsc" text;--> statement-breakpoint
ALTER TABLE "acct_accounts" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "acct_accounts" SET "sort_order" = sub.n * 10 FROM (SELECT "id", row_number() OVER (PARTITION BY "tenant_id" ORDER BY "code") AS n FROM "acct_accounts") sub WHERE sub."id" = "acct_accounts"."id" AND "acct_accounts"."sort_order" = 0;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_bank_statements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "acct_accounts"("id") ON DELETE CASCADE,
  "file_name" text NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "closing_paise" bigint,
  "line_count" integer DEFAULT 0 NOT NULL,
  "matched_count" integer DEFAULT 0 NOT NULL,
  "imported_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "acct_bank_statements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_bank_statements";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_bank_statements"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_bank_statements" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acct_bank_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "statement_id" uuid NOT NULL REFERENCES "acct_bank_statements"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "acct_accounts"("id") ON DELETE CASCADE,
  "txn_date" date NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "reference" text DEFAULT '' NOT NULL,
  "debit_paise" bigint DEFAULT 0 NOT NULL,
  "credit_paise" bigint DEFAULT 0 NOT NULL,
  "balance_paise" bigint,
  "status" text DEFAULT 'unmatched' NOT NULL,
  "voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL,
  "settlement_batch_id" uuid REFERENCES "settlement_batches"("id") ON DELETE SET NULL,
  "match_kind" text,
  "matched_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "matched_at" timestamp with time zone,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_bank_lines_statement_idx" ON "acct_bank_lines" ("statement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_bank_lines_status_idx" ON "acct_bank_lines" ("tenant_id","account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acct_bank_lines_voucher_uq" ON "acct_bank_lines" ("voucher_id") WHERE voucher_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "acct_bank_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "acct_bank_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "acct_bank_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "acct_bank_lines" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "enforce" text DEFAULT 'warn' NOT NULL;
