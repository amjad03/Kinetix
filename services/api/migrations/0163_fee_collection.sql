-- Fee collection depth: one receipt for many fees and many payment modes (DD, card, scholarship money too), the
-- head-by-head allocation of every payment, receipt cancellation with approval and reissue, bank challans with a
-- reconciliation upload, cash handover, refund chains with payee details and reversal, government scholarships,
-- carrying dues forward and the reminder log. Every paid payment so far gets its own receipt record.
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'dd';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'card';--> statement-breakpoint
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'scholarship';--> statement-breakpoint
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'cancelled';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "receipt_no" text NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "total_paise" bigint NOT NULL,
  "advance_paise" bigint DEFAULT 0 NOT NULL,
  "modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "cancel_reason" text,
  "cancel_requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "cancel_requested_at" timestamp with time zone,
  "cancelled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "cancelled_at" timestamp with time zone,
  "reissue_of" uuid REFERENCES "fee_receipts"("id") ON DELETE SET NULL,
  "print_count" integer DEFAULT 0 NOT NULL,
  "last_printed_at" timestamp with time zone,
  "collected_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "collected_on" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_receipts_no_uq" ON "fee_receipts" ("tenant_id","receipt_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_receipts_student_idx" ON "fee_receipts" ("student_id","collected_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_receipts_day_idx" ON "fee_receipts" ("tenant_id","collected_on");--> statement-breakpoint
ALTER TABLE "fee_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_receipts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_receipts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_receipts" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "receipt_id" uuid REFERENCES "fee_receipts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "convenience_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payments_receipt_idx" ON "fee_payments" ("receipt_id");--> statement-breakpoint
DROP INDEX IF EXISTS "fee_payments_receipt_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payments_receipt_uq" ON "fee_payments" ("tenant_id","receipt_no") WHERE receipt_id IS NULL;--> statement-breakpoint
INSERT INTO "fee_receipts" ("id","tenant_id","receipt_no","student_id","total_paise","modes","status","collected_by","collected_on","created_at")
  SELECT p."id", p."tenant_id", p."receipt_no", p."student_id", p."amount_paise",
    jsonb_build_array(jsonb_build_object('method', p."method"::text, 'amountPaise', p."amount_paise", 'reference', p."reference")),
    CASE WHEN p."status"::text = 'failed' THEN 'bounced' ELSE 'active' END,
    p."recorded_by", (coalesce(p."paid_at", p."created_at") AT TIME ZONE 'Asia/Kolkata')::date, coalesce(p."paid_at", p."created_at")
  FROM "fee_payments" p WHERE p."receipt_no" IS NOT NULL AND p."receipt_id" IS NULL
  ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "fee_payments" p SET "receipt_id" = p."id" WHERE p."receipt_no" IS NOT NULL AND p."receipt_id" IS NULL AND EXISTS (SELECT 1 FROM "fee_receipts" r WHERE r."id" = p."id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_id" uuid NOT NULL REFERENCES "fee_payments"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "line_id" uuid REFERENCES "fee_invoice_lines"("id") ON DELETE SET NULL,
  "head_code" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payment_allocations_payment_idx" ON "fee_payment_allocations" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payment_allocations_invoice_idx" ON "fee_payment_allocations" ("invoice_id");--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_payment_allocations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_payment_allocations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_payment_allocations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_cheques" ADD COLUMN IF NOT EXISTS "receipt_id" uuid REFERENCES "fee_receipts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_cheques" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'cheque' NOT NULL;--> statement-breakpoint
UPDATE "fee_cheques" q SET "receipt_id" = p."receipt_id" FROM "fee_payments" p WHERE p."id" = q."payment_id" AND q."receipt_id" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_challans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "invoice_ids" uuid[] DEFAULT '{}' NOT NULL,
  "amount_paise" bigint NOT NULL,
  "bank_name" text NOT NULL,
  "bank_account" text DEFAULT '' NOT NULL,
  "valid_until" date NOT NULL,
  "status" text DEFAULT 'issued' NOT NULL,
  "paid_on" date,
  "bank_ref" text,
  "receipt_id" uuid REFERENCES "fee_receipts"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_challans_number_uq" ON "fee_challans" ("tenant_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_challans_status_idx" ON "fee_challans" ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "fee_challans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_challans";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_challans"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_challans" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "fee_cash_closings" ADD COLUMN IF NOT EXISTS "handed_to" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_cash_closings" ADD COLUMN IF NOT EXISTS "handed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "trail" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "close_dues" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "quote" jsonb;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "payee_name" text;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "payee_account" text;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "payee_ifsc" text;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "reverted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "reverted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_refund_requests" ADD COLUMN IF NOT EXISTS "revert_reason" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_govt_scholarships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "scheme" text NOT NULL,
  "portal" text DEFAULT 'state' NOT NULL,
  "application_no" text NOT NULL,
  "academic_year" text NOT NULL,
  "status" text DEFAULT 'applied' NOT NULL,
  "applied_paise" bigint DEFAULT 0 NOT NULL,
  "applied_on" date,
  "sanctioned_paise" bigint DEFAULT 0 NOT NULL,
  "sanctioned_on" date,
  "received_paise" bigint DEFAULT 0 NOT NULL,
  "received_on" date,
  "reference" text,
  "note" text DEFAULT '' NOT NULL,
  "receipt_id" uuid REFERENCES "fee_receipts"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_govt_scholarships_app_uq" ON "fee_govt_scholarships" ("tenant_id","portal","application_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_govt_scholarships_student_idx" ON "fee_govt_scholarships" ("student_id");--> statement-breakpoint
ALTER TABLE "fee_govt_scholarships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_govt_scholarships";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_govt_scholarships"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_govt_scholarships" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_carry_forwards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "from_year" text NOT NULL,
  "to_year" text NOT NULL,
  "from_invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "to_invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_carry_forwards_from_uq" ON "fee_carry_forwards" ("from_invoice_id");--> statement-breakpoint
ALTER TABLE "fee_carry_forwards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_carry_forwards";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_carry_forwards"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_carry_forwards" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_reminder_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "run_on" date NOT NULL,
  "kind" text DEFAULT 'scheduled' NOT NULL,
  "students" integer DEFAULT 0 NOT NULL,
  "app" integer DEFAULT 0 NOT NULL,
  "sms" integer DEFAULT 0 NOT NULL,
  "whatsapp" integer DEFAULT 0 NOT NULL,
  "skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "run_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_reminder_runs_day_idx" ON "fee_reminder_runs" ("tenant_id","run_on");--> statement-breakpoint
ALTER TABLE "fee_reminder_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_reminder_runs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_reminder_runs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_reminder_runs" TO kinetix_app;
  END IF;
END $$;
