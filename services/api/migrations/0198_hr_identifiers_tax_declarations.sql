-- HR and payroll pass, part 1: staff PAN/UAN encrypted at rest, investment declarations with proofs, reimbursement
-- claims, non-taxable payroll adjustments, and the bank-specific salary transfer file settings.

-- Staff PAN and UAN: the clear columns become sealed ones (hr/staff-ids.ts). Values written before this migration stay
-- readable and are encrypted right after it by `migrate` (built image) or `pnpm secrets:rotate`.
ALTER TABLE "staff_profiles" RENAME COLUMN "pan" TO "pan_enc";--> statement-breakpoint
ALTER TABLE "staff_profiles" RENAME COLUMN "uan" TO "uan_enc";--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "pan_last4" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "uan_last4" text;--> statement-breakpoint
-- A payslip used to copy the PAN and UAN into its stored figures. Keep any the staff record lacks, then drop the copies.
UPDATE "staff_profiles" sp SET "pan_enc" = x.pan
  FROM (SELECT DISTINCT ON (user_id) user_id, data->>'pan' AS pan FROM payslips WHERE coalesce(data->>'pan', '') <> '' ORDER BY user_id, created_at DESC) x
  WHERE sp.user_id = x.user_id AND sp.pan_enc IS NULL;--> statement-breakpoint
UPDATE "staff_profiles" sp SET "uan_enc" = x.uan
  FROM (SELECT DISTINCT ON (user_id) user_id, data->>'uan' AS uan FROM payslips WHERE coalesce(data->>'uan', '') <> '' ORDER BY user_id, created_at DESC) x
  WHERE sp.user_id = x.user_id AND sp.uan_enc IS NULL;--> statement-breakpoint
UPDATE "payslips" SET "data" = "data" - 'pan' - 'uan' WHERE "data" ? 'pan' OR "data" ? 'uan';--> statement-breakpoint
UPDATE "staff_profiles" SET "pan_last4" = right("pan_enc", 4) WHERE "pan_enc" IS NOT NULL AND "pan_enc" !~ '^v[0-9]+\.';--> statement-breakpoint
UPDATE "staff_profiles" SET "uan_last4" = right("uan_enc", 4) WHERE "uan_enc" IS NOT NULL AND "uan_enc" !~ '^v[0-9]+\.';--> statement-breakpoint

-- Adjustments that are not taxable salary (reimbursements against bills) and are not wages for ESI or PT.
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "wage" boolean DEFAULT true NOT NULL;--> statement-breakpoint

-- Salary transfer file: which bank's upload format, and the institution's debit account (sealed like other account numbers).
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "bank_file" jsonb DEFAULT '{"format":"generic","debitAccountEnc":null,"debitAccountLast4":null,"corporateId":""}'::jsonb NOT NULL;--> statement-breakpoint

-- Investment declarations (Form 12BB) for a financial year, and their proofs.
CREATE TABLE IF NOT EXISTS "tax_declarations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "fy" smallint NOT NULL,
  "regime" text DEFAULT 'new' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "rent_monthly_paise" bigint DEFAULT 0 NOT NULL,
  "rent_months" smallint DEFAULT 0 NOT NULL,
  "metro" boolean DEFAULT false NOT NULL,
  "landlord_name" text DEFAULT '' NOT NULL,
  "landlord_pan_enc" text,
  "submitted_at" timestamp with time zone,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp with time zone,
  "proofs_submitted_at" timestamp with time zone,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "verified_at" timestamp with time zone,
  "decision_note" text DEFAULT '' NOT NULL,
  "applied" jsonb,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_declarations_user_fy_uq" ON "tax_declarations" ("tenant_id", "user_id", "fy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_declarations_status_idx" ON "tax_declarations" ("tenant_id", "fy", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_declaration_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "declaration_id" uuid NOT NULL REFERENCES "tax_declarations"("id") ON DELETE cascade,
  "section" text NOT NULL,
  "label" text DEFAULT '' NOT NULL,
  "declared_paise" bigint NOT NULL,
  "proof_status" text DEFAULT 'none' NOT NULL,
  "proof_key" text,
  "proof_name" text,
  "proof_type" text,
  "accepted_paise" bigint,
  "proof_note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_declaration_items_decl_idx" ON "tax_declaration_items" ("declaration_id");--> statement-breakpoint

-- Reimbursement claims against bills, paid through payroll.
CREATE TABLE IF NOT EXISTS "reimbursement_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "claim_no" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "category" text NOT NULL,
  "spent_on" date NOT NULL,
  "amount_paise" bigint NOT NULL,
  "approved_paise" bigint,
  "description" text DEFAULT '' NOT NULL,
  "bill_key" text,
  "bill_name" text,
  "bill_type" text,
  "status" text DEFAULT 'submitted' NOT NULL,
  "pay_month" text,
  "adjustment_id" uuid REFERENCES "payroll_adjustments"("id") ON DELETE set null,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "decided_at" timestamp with time zone,
  "decision_note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reimbursement_claims_no_uq" ON "reimbursement_claims" ("tenant_id", "claim_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reimbursement_claims_user_idx" ON "reimbursement_claims" ("tenant_id", "user_id", "status");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_declarations', 'tax_declaration_items', 'reimbursement_claims'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
