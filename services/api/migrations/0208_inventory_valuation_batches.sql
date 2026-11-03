-- Stores pass: the item master carries HSN, GST rate, item type, batch tracking and its valuation method; stock is
-- valued (a value beside each quantity, a cost on every ledger row) over cost layers that also hold batches with
-- expiry dates; numbered issue slips to departments; stock write-offs (scrap, expiry, loss) that wait for approval;
-- receipts record batches and who inspected them.
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "hsn_code" text;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "gst_rate_pct" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "item_type" text DEFAULT 'consumable' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "batch_tracked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "shelf_life_days" integer;--> statement-breakpoint
ALTER TABLE "inv_items" ADD COLUMN IF NOT EXISTS "valuation" text DEFAULT 'weighted_average' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_items" DROP CONSTRAINT IF EXISTS "inv_items_valuation_ck";--> statement-breakpoint
ALTER TABLE "inv_items" ADD CONSTRAINT "inv_items_valuation_ck" CHECK ("valuation" IN ('fifo', 'weighted_average'));--> statement-breakpoint
ALTER TABLE "inv_items" DROP CONSTRAINT IF EXISTS "inv_items_type_ck";--> statement-breakpoint
ALTER TABLE "inv_items" ADD CONSTRAINT "inv_items_type_ck" CHECK ("item_type" IN ('consumable', 'chemical', 'provision', 'spare', 'durable'));--> statement-breakpoint
ALTER TABLE "inv_items" DROP CONSTRAINT IF EXISTS "inv_items_gst_ck";--> statement-breakpoint
ALTER TABLE "inv_items" ADD CONSTRAINT "inv_items_gst_ck" CHECK ("gst_rate_pct" >= 0 AND "gst_rate_pct" <= 40);--> statement-breakpoint
ALTER TABLE "inv_stock" ADD COLUMN IF NOT EXISTS "value_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "inv_stock" s SET "value_paise" = s."qty" * i."last_price_paise" FROM "inv_items" i WHERE i."id" = s."item_id" AND s."value_paise" = 0 AND s."qty" > 0;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD COLUMN IF NOT EXISTS "unit_cost_paise" bigint;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD COLUMN IF NOT EXISTS "value_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD COLUMN IF NOT EXISTS "batch_no" text;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD COLUMN IF NOT EXISTS "expiry_on" date;--> statement-breakpoint
UPDATE "inv_stock_moves" m SET "value_paise" = m."delta" * i."last_price_paise", "unit_cost_paise" = i."last_price_paise" FROM "inv_items" i WHERE i."id" = m."item_id" AND m."unit_cost_paise" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_stock_moves_store_kind_idx" ON "inv_stock_moves" ("tenant_id", "kind", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_stock_layers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
  "item_id" uuid NOT NULL REFERENCES "inv_items"("id"),
  "batch_no" text DEFAULT '' NOT NULL,
  "mfg_on" date,
  "expiry_on" date,
  "received_on" date NOT NULL,
  "qty_in" integer NOT NULL,
  "qty_left" integer NOT NULL,
  "unit_cost_paise" bigint NOT NULL,
  "source_move_id" uuid REFERENCES "inv_stock_moves"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inv_stock_layers_qty_ck" CHECK ("qty_left" >= 0 AND "qty_left" <= "qty_in")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_stock_layers_open_idx" ON "inv_stock_layers" ("store_id", "item_id", "expiry_on") WHERE "qty_left" > 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_stock_layers_expiry_idx" ON "inv_stock_layers" ("tenant_id", "expiry_on") WHERE "qty_left" > 0 AND "expiry_on" IS NOT NULL;--> statement-breakpoint
-- Opening layers for stock already held: one per store and item at the last price, dated by its first receipt.
INSERT INTO "inv_stock_layers" ("tenant_id", "store_id", "item_id", "received_on", "qty_in", "qty_left", "unit_cost_paise")
SELECT s."tenant_id", s."store_id", s."item_id",
  coalesce((SELECT min(m."created_at")::date FROM "inv_stock_moves" m WHERE m."store_id" = s."store_id" AND m."item_id" = s."item_id" AND m."delta" > 0), current_date),
  s."qty", s."qty", i."last_price_paise"
FROM "inv_stock" s JOIN "inv_items" i ON i."id" = s."item_id"
WHERE s."qty" > 0 AND NOT EXISTS (SELECT 1 FROM "inv_stock_layers" l WHERE l."store_id" = s."store_id" AND l."item_id" = s."item_id");--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD COLUMN IF NOT EXISTS "batch_no" text;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD COLUMN IF NOT EXISTS "mfg_on" date;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD COLUMN IF NOT EXISTS "expiry_on" date;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD COLUMN IF NOT EXISTS "inspected_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD COLUMN IF NOT EXISTS "inspection_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD COLUMN IF NOT EXISTS "received_on" date;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_issue_slips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "issued_to" text NOT NULL,
  "received_by" text DEFAULT '' NOT NULL,
  "requisition_id" uuid REFERENCES "inv_requisitions"("id") ON DELETE SET NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "value_paise" bigint DEFAULT 0 NOT NULL,
  "lines" integer DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_issue_slips_number_uq" ON "inv_issue_slips" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inv_issue_slips_dept_idx" ON "inv_issue_slips" ("tenant_id", "department_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inv_write_offs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
  "item_id" uuid NOT NULL REFERENCES "inv_items"("id"),
  "batch_no" text,
  "qty" integer NOT NULL CHECK ("qty" > 0),
  "reason" text NOT NULL,
  "kind" text NOT NULL,
  "disposal_mode" text DEFAULT 'scrap' NOT NULL,
  "realised_paise" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "value_paise" bigint DEFAULT 0 NOT NULL,
  "proposed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inv_write_offs_kind_ck" CHECK ("kind" IN ('expired', 'damaged', 'obsolete', 'lost', 'shortage')),
  CONSTRAINT "inv_write_offs_mode_ck" CHECK ("disposal_mode" IN ('scrap', 'auction', 'destroy', 'return_to_vendor', 'none')),
  CONSTRAINT "inv_write_offs_status_ck" CHECK ("status" IN ('proposed', 'approved', 'rejected'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inv_write_offs_number_uq" ON "inv_write_offs" ("tenant_id", "number");--> statement-breakpoint
ALTER TABLE "inv_stock_layers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_stock_layers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_stock_layers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_stock_layers" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "inv_issue_slips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_issue_slips";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_issue_slips"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_issue_slips" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "inv_write_offs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_write_offs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_write_offs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_write_offs" TO zynetix_app;
  END IF;
END $$;
