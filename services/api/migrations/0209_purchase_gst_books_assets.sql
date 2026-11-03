-- Purchase pass: vendors carry their GST state, registration type and MSME (Udyam) number; quotations, orders and
-- invoices carry GST by line (CGST and SGST within the state, IGST between states); invoices and debit notes post to
-- the books (purchase journal, payment voucher) and remember the vouchers; assets carry the day they were put to
-- use, their Income-tax block, and whether they belong to a laboratory's equipment register (AICTE, NAAC 4.1).
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "state_code" text;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "gst_registration" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "msme_udyam_no" text;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "msme_category" text;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD COLUMN IF NOT EXISTS "payment_terms_days" integer;--> statement-breakpoint
ALTER TABLE "inv_vendors" DROP CONSTRAINT IF EXISTS "inv_vendors_gst_reg_ck";--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD CONSTRAINT "inv_vendors_gst_reg_ck" CHECK ("gst_registration" IN ('regular', 'composition', 'unregistered'));--> statement-breakpoint
UPDATE "inv_vendors" SET "state_code" = substr("gstin", 1, 2) WHERE "gstin" IS NOT NULL AND "state_code" IS NULL;--> statement-breakpoint
UPDATE "inv_vendors" SET "gst_registration" = 'unregistered' WHERE "gstin" IS NULL;--> statement-breakpoint
ALTER TABLE "inv_quote_lines" ADD COLUMN IF NOT EXISTS "gst_rate_pct" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_quotes" ADD COLUMN IF NOT EXISTS "taxable_paise" bigint;--> statement-breakpoint
ALTER TABLE "inv_quotes" ADD COLUMN IF NOT EXISTS "tax_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "inv_quotes" SET "taxable_paise" = "total_paise" WHERE "taxable_paise" IS NULL;--> statement-breakpoint
ALTER TABLE "inv_po_lines" ADD COLUMN IF NOT EXISTS "gst_rate_pct" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_po_lines" ADD COLUMN IF NOT EXISTS "tax_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "taxable_paise" bigint;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "tax_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN IF NOT EXISTS "inter_state" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "inv_purchase_orders" SET "taxable_paise" = "total_paise" WHERE "taxable_paise" IS NULL;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "taxable_paise" bigint;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "due_on" date;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "journal_voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD COLUMN IF NOT EXISTS "payment_voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "inv_invoices" SET "taxable_paise" = "amount_paise" WHERE "taxable_paise" IS NULL;--> statement-breakpoint
ALTER TABLE "inv_debit_notes" ADD COLUMN IF NOT EXISTS "voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "put_to_use_on" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "it_block" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "lab_equipment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "working" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "calibration_due_on" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "custodian_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "grn_id" uuid REFERENCES "inv_goods_receipts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "asset_gl_postings" ADD COLUMN IF NOT EXISTS "voucher_id" uuid REFERENCES "acct_vouchers"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_lab_idx" ON "assets" ("tenant_id", "room_id") WHERE "lab_equipment";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_invoices_due_idx" ON "inv_invoices" ("tenant_id", "status", "due_on");
