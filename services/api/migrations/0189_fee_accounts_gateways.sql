-- Fee accounts and payment gateways (fees pass, owner requirements 1 to 3).
-- A fee account is a separate collecting entity of the institution (the trust, the college, the hostel): its own
-- receipt number series, bank and cash ledgers, books (a fund), UPI id and gateway credentials. Fee heads and invoices
-- name their account; receipts are numbered in the account's series. Gateway credentials can be kept per fee account
-- (Razorpay, PayU, Cashfree, Easebuzz, CCAvenue), each in test or live mode. Webhook events are kept once per gateway
-- event so a repeated notice is not processed twice, and payment links let the office send a payable link by SMS,
-- WhatsApp or email that expires.
CREATE TABLE IF NOT EXISTS "fee_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "legal_name" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'institution',
  "pan" text,
  "gstin" text,
  "reg_80g" text,
  "address" text NOT NULL DEFAULT '',
  "fund_id" uuid REFERENCES "acct_funds"("id") ON DELETE SET NULL,
  "bank_account_id" uuid REFERENCES "acct_accounts"("id") ON DELETE SET NULL,
  "cash_account_id" uuid REFERENCES "acct_accounts"("id") ON DELETE SET NULL,
  "receipt_prefix" text,
  "upi_vpa" text,
  "upi_payee_name" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_accounts_code_uq" ON "fee_accounts" ("tenant_id", "code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_accounts_default_uq" ON "fee_accounts" ("tenant_id") WHERE is_default;--> statement-breakpoint

ALTER TABLE "fee_heads" ADD COLUMN IF NOT EXISTS "fee_account_id" uuid REFERENCES "fee_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "fee_account_id" uuid REFERENCES "fee_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "fee_account_id" uuid REFERENCES "fee_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoices_account_idx" ON "fee_invoices" ("tenant_id", "fee_account_id", "status");--> statement-breakpoint
ALTER TABLE "fee_receipts" ADD COLUMN IF NOT EXISTS "fee_account_id" uuid REFERENCES "fee_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "gateway_account_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "status_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "status_checks" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "link_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "pos_terminal" text;--> statement-breakpoint
-- What the gateway's checkout needs (hosted form fields or SDK session), for the browser launch page the apps open.
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "checkout" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payments_pending_idx" ON "fee_payments" ("tenant_id", "status", "created_at") WHERE status = 'created' AND method = 'online';--> statement-breakpoint

-- Gateway credentials: one row per institution (fee_account_id null: the default) or per fee account.
ALTER TABLE "payment_gateway_accounts" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD COLUMN IF NOT EXISTS "fee_account_id" uuid REFERENCES "fee_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'test';--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD COLUMN IF NOT EXISTS "access_code" text;--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;--> statement-breakpoint
UPDATE "payment_gateway_accounts" SET "mode" = 'live' WHERE "provider" = 'razorpay' AND "key_id" LIKE 'rzp_live_%';--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" DROP CONSTRAINT IF EXISTS "payment_gateway_accounts_pkey";--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD PRIMARY KEY ("id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_gateway_accounts_scope_uq" ON "payment_gateway_accounts" ("tenant_id", (coalesce("fee_account_id", '00000000-0000-0000-0000-000000000000'::uuid)));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gateway_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "event_key" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'payment',
  "order_id" text,
  "payment_id" uuid REFERENCES "fee_payments"("id") ON DELETE SET NULL,
  "outcome" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gateway_webhook_events_uq" ON "gateway_webhook_events" ("tenant_id", "provider", "event_key");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fee_payment_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "number" text NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "allow_partial" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "channels" text[] NOT NULL DEFAULT '{}',
  "sent" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "opened_at" timestamp with time zone,
  "payment_id" uuid REFERENCES "fee_payments"("id") ON DELETE SET NULL,
  "paid_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payment_links_token_uq" ON "fee_payment_links" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payment_links_number_uq" ON "fee_payment_links" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payment_links_student_idx" ON "fee_payment_links" ("student_id", "status");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_accounts', 'gateway_webhook_events', 'fee_payment_links'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
