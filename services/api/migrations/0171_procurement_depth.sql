-- Procurement and stores depth: store kinds, item categories with approved vendors, vendor rating and blacklist,
-- rate contracts, indents with a department, an estimate, a budget check and an approval chain, purchase order
-- approval, purchase mode (GeM, tender), committee minutes and amendments, rejected goods with debit notes, payment
-- vouchers, issue to departments, stock verification and the gate register.
ALTER TABLE "inv_stores" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'central' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_stores" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inv_stores" ADD COLUMN IF NOT EXISTS "custodian_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inv_stores" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_stores" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "reorder_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "last_price_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "contact_person" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "pan" text;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "blacklisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "blacklist_reason" text;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "blacklisted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD COLUMN IF NOT EXISTS "estimated_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD COLUMN IF NOT EXISTS "budget_status" text;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD COLUMN IF NOT EXISTS "step" text;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD COLUMN IF NOT EXISTS "needed_by" date;--> statement-breakpoint
UPDATE "inv_requisitions" SET "step" = 'principal' WHERE "status" = 'submitted' AND "step" IS NULL;--> statement-breakpoint
ALTER TABLE "inv_requisition_lines" ADD COLUMN IF NOT EXISTS "est_unit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "purchase_mode" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "gem_ref" text;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "tender_ref" text;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "amendment_no" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "committee_minutes" text;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "committee_met_on" date;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "committee_members" text;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "delivery_by" date;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "terms" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD COLUMN IF NOT EXISTS "number" text;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD COLUMN IF NOT EXISTS "challan_no" text;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD COLUMN IF NOT EXISTS "rejected_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD COLUMN IF NOT EXISTS "reject_reason" text;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "invoice_date" date;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "voucher_no" text;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "paid_on" date;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "payment_mode" text;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "payment_ref" text;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "debit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_categories_name_uq" ON "inv_categories" ("tenant_id", lower("name"));--> statement-breakpoint
INSERT INTO "inv_categories" ("tenant_id", "name") SELECT DISTINCT "tenant_id", "category" FROM "inv_items" ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "inv_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_categories";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_categories"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_categories" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_approved_vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "inv_categories"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "inv_vendors"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_approved_vendors_uq" ON "inv_approved_vendors" ("category_id", "vendor_id");--> statement-breakpoint
ALTER TABLE "inv_approved_vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_approved_vendors";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_approved_vendors"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_approved_vendors" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_vendor_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "inv_vendors"("id") ON DELETE CASCADE,
  "po_id" uuid REFERENCES "inv_purchase_orders"("id") ON DELETE SET NULL,
  "quality" smallint NOT NULL,
  "delivery" smallint NOT NULL,
  "price" smallint NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "rated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_vendor_ratings_vendor_idx" ON "inv_vendor_ratings" ("vendor_id");--> statement-breakpoint
ALTER TABLE "inv_vendor_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_vendor_ratings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_vendor_ratings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_vendor_ratings" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_rate_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "inv_vendors"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "inv_items"("id") ON DELETE CASCADE,
  "rate_paise" bigint NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date NOT NULL,
  "reference" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inv_rate_contracts_dates_ck" CHECK ("valid_to" >= "valid_from")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_rate_contracts_item_idx" ON "inv_rate_contracts" ("item_id", "valid_to");--> statement-breakpoint
ALTER TABLE "inv_rate_contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_rate_contracts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_rate_contracts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_rate_contracts" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "requisition_id" uuid REFERENCES "inv_requisitions"("id") ON DELETE CASCADE,
  "po_id" uuid REFERENCES "inv_purchase_orders"("id") ON DELETE CASCADE,
  "step" text NOT NULL,
  "decision" text NOT NULL,
  "note" text,
  "budget_override" boolean DEFAULT false NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_approvals_req_idx" ON "inv_approvals" ("requisition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_approvals_po_idx" ON "inv_approvals" ("po_id");--> statement-breakpoint
ALTER TABLE "inv_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_approvals";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_approvals"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_approvals" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_po_amendments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "po_id" uuid NOT NULL REFERENCES "inv_purchase_orders"("id") ON DELETE CASCADE,
  "amendment_no" integer NOT NULL,
  "reason" text NOT NULL,
  "before" jsonb NOT NULL,
  "after" jsonb NOT NULL,
  "amended_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "inv_po_amendments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_po_amendments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_po_amendments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_po_amendments" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_debit_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "inv_vendors"("id"),
  "po_id" uuid NOT NULL REFERENCES "inv_purchase_orders"("id"),
  "receipt_id" uuid REFERENCES "inv_goods_receipts"("id") ON DELETE SET NULL,
  "return_id" uuid REFERENCES "inv_returns"("id") ON DELETE SET NULL,
  "amount_paise" bigint NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "invoice_id" uuid REFERENCES "inv_invoices"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_debit_notes_number_uq" ON "inv_debit_notes" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_debit_notes_po_idx" ON "inv_debit_notes" ("po_id");--> statement-breakpoint
ALTER TABLE "inv_debit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_debit_notes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_debit_notes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_debit_notes" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_stock_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
  "fiscal_year" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "started_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_stock_verifications_number_uq" ON "inv_stock_verifications" ("tenant_id", "number");--> statement-breakpoint
ALTER TABLE "inv_stock_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_stock_verifications";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_stock_verifications"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_stock_verifications" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_stock_verification_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "verification_id" uuid NOT NULL REFERENCES "inv_stock_verifications"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "inv_items"("id"),
  "book_qty" integer NOT NULL,
  "counted_qty" integer,
  "remark" text DEFAULT '' NOT NULL,
  "counted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "counted_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_stock_verification_lines_uq" ON "inv_stock_verification_lines" ("verification_id", "item_id");--> statement-breakpoint
ALTER TABLE "inv_stock_verification_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_stock_verification_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_stock_verification_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_stock_verification_lines" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_gate_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "direction" text NOT NULL,
  "kind" text DEFAULT 'goods' NOT NULL,
  "party" text NOT NULL,
  "vehicle_no" text DEFAULT '' NOT NULL,
  "description" text NOT NULL,
  "qty" integer DEFAULT 1 NOT NULL,
  "document_no" text DEFAULT '' NOT NULL,
  "po_id" uuid REFERENCES "inv_purchase_orders"("id") ON DELETE SET NULL,
  "expected_return_on" date,
  "returned_on" date,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_gate_entries_number_uq" ON "inv_gate_entries" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_gate_entries_at_idx" ON "inv_gate_entries" ("tenant_id", "created_at");--> statement-breakpoint
ALTER TABLE "inv_gate_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_gate_entries";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_gate_entries"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_gate_entries" TO zynetix_app;
  END IF;
END $$;
