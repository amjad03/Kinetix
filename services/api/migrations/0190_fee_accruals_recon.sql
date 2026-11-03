-- Fee accounting on the accrual basis, bank matching of NEFT and challans, government scholarship tracking, duplicate
-- payments and programme transfers (fees pass, owner requirements 3 to 5).
--
-- fee_accruals: what the books were told about an invoice, by head: charges raised (fees, fines, cheque-return
-- charges, revisions) debit the students' receivable and credit the head's income; concessions, scholarships,
-- waivers and write-offs credit the receivable and debit their expense. Each row names the journal it posted.
CREATE TABLE IF NOT EXISTS "fee_accruals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "head_code" text NOT NULL,
  "kind" text NOT NULL,
  "paise" bigint NOT NULL,
  "voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_accruals_invoice_idx" ON "fee_accruals" ("invoice_id", "head_code");--> statement-breakpoint

ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "basis" text NOT NULL DEFAULT 'cash';--> statement-breakpoint
-- Invoices raised from this moment are booked on the accrual basis; older ones stay on receipts.
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "accrual_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "online" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "fee_accounts_settings" ADD COLUMN IF NOT EXISTS "escalations" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint

-- A bank statement line can be a challan paid at the bank, a family's NEFT (by UTR or the student's fee reference),
-- and the receipt it made.
ALTER TABLE "acct_bank_lines" ADD COLUMN IF NOT EXISTS "challan_id" uuid REFERENCES "fee_challans"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "acct_bank_lines" ADD COLUMN IF NOT EXISTS "transfer_id" uuid REFERENCES "bank_transfer_submissions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "acct_bank_lines" ADD COLUMN IF NOT EXISTS "receipt_id" uuid REFERENCES "fee_receipts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "acct_bank_lines" ADD COLUMN IF NOT EXISTS "student_id" uuid REFERENCES "students"("id") ON DELETE SET NULL;--> statement-breakpoint

-- The student's fee reference for NEFT narrations and the bank's virtual account (e.g. "SDY2600123").
ALTER TABLE "fee_student_profiles" ADD COLUMN IF NOT EXISTS "fee_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_student_profiles_ref_uq" ON "fee_student_profiles" ("tenant_id", "fee_ref") WHERE fee_ref IS NOT NULL;--> statement-breakpoint

-- Government scholarships (Karnataka SSP, NSP, other state and central schemes): verification by the institution,
-- what is expected against what came, whether the expected amount holds the dues back from reminders and holds,
-- and the portal's own status text.
ALTER TABLE "fee_govt_scholarships" ADD COLUMN IF NOT EXISTS "expected_paise" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fee_govt_scholarships" ADD COLUMN IF NOT EXISTS "hold_dues" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "fee_govt_scholarships" ADD COLUMN IF NOT EXISTS "verified_on" date;--> statement-breakpoint
ALTER TABLE "fee_govt_scholarships" ADD COLUMN IF NOT EXISTS "portal_status" text;--> statement-breakpoint
ALTER TABLE "fee_govt_scholarships" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "fee_govt_scholarships" ADD COLUMN IF NOT EXISTS "invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL;--> statement-breakpoint

-- A payment that looks like one already made (same student, amount and day, or a second online payment of a paid
-- fee): kept, flagged, and settled by a person (refund, keep as advance, or not a duplicate).
CREATE TABLE IF NOT EXISTS "fee_payment_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_id" uuid NOT NULL REFERENCES "fee_payments"("id") ON DELETE CASCADE,
  "other_payment_id" uuid REFERENCES "fee_payments"("id") ON DELETE SET NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'duplicate',
  "reason" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "resolution" text,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payment_flags_payment_uq" ON "fee_payment_flags" ("payment_id", "kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payment_flags_status_idx" ON "fee_payment_flags" ("tenant_id", "status");--> statement-breakpoint

-- A student moved to another programme (or fee structure) part way through the year: what the old structure keeps,
-- what the new one charges, and the reason.
CREATE TABLE IF NOT EXISTS "fee_programme_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "from_structure_id" uuid,
  "to_structure_id" uuid NOT NULL,
  "from_section_id" uuid,
  "to_section_id" uuid,
  "effective_on" date NOT NULL,
  "used_percent" integer NOT NULL,
  "old_kept_paise" bigint NOT NULL DEFAULT 0,
  "old_reduced_paise" bigint NOT NULL DEFAULT 0,
  "new_charged_paise" bigint NOT NULL DEFAULT 0,
  "new_invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "kind" text NOT NULL DEFAULT 'transfer',
  "reason" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_programme_transfers_student_idx" ON "fee_programme_transfers" ("student_id");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_accruals', 'fee_payment_flags', 'fee_programme_transfers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
