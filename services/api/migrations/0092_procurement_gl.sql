CREATE TABLE "inv_rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"number" text NOT NULL,
	"requisition_id" uuid NOT NULL REFERENCES "inv_requisitions"("id"),
	"status" text DEFAULT 'open' NOT NULL,
	"closes_on" date,
	"awarded_quote_id" uuid,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inv_rfq_status_ck" CHECK (status IN ('open', 'awarded', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inv_rfq_number_uq" ON "inv_rfqs" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE TABLE "inv_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"rfq_id" uuid NOT NULL REFERENCES "inv_rfqs"("id") ON DELETE cascade,
	"vendor_id" uuid NOT NULL REFERENCES "inv_vendors"("id"),
	"delivery_days" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"total_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inv_quote_vendor_uq" ON "inv_quotes" USING btree ("rfq_id","vendor_id");--> statement-breakpoint
CREATE TABLE "inv_quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"quote_id" uuid NOT NULL REFERENCES "inv_quotes"("id") ON DELETE cascade,
	"item_id" uuid NOT NULL REFERENCES "inv_items"("id"),
	"unit_price_paise" bigint NOT NULL CHECK (unit_price_paise > 0)
);
--> statement-breakpoint
CREATE TABLE "inv_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"number" text NOT NULL,
	"from_store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
	"to_store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
	"item_id" uuid NOT NULL REFERENCES "inv_items"("id"),
	"qty" integer NOT NULL CHECK (qty > 0),
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inv_transfer_stores_ck" CHECK (from_store_id <> to_store_id)
);
--> statement-breakpoint
CREATE TABLE "inv_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"store_id" uuid NOT NULL REFERENCES "inv_stores"("id"),
	"item_id" uuid NOT NULL REFERENCES "inv_items"("id"),
	"qty" integer NOT NULL CHECK (qty > 0),
	"vendor_id" uuid REFERENCES "inv_vendors"("id"),
	"po_id" uuid REFERENCES "inv_purchase_orders"("id"),
	"issued_to" text,
	"reason" text NOT NULL,
	"credit_paise" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inv_return_kind_ck" CHECK (kind IN ('vendor', 'issue'))
);
--> statement-breakpoint
CREATE TABLE "asset_gl_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"asset_id" uuid NOT NULL REFERENCES "assets"("id"),
	"kind" text NOT NULL,
	"fiscal_year" text NOT NULL,
	"posted_on" date NOT NULL,
	"voucher_no" text NOT NULL,
	"narration" text NOT NULL,
	"lines" jsonb NOT NULL,
	"posted_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_gl_kind_ck" CHECK (kind IN ('depreciation', 'disposal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asset_gl_uq" ON "asset_gl_postings" USING btree ("asset_id","kind","fiscal_year");
--> statement-breakpoint
ALTER TABLE "inv_rfqs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_rfqs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_rfqs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_rfqs" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "inv_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_quotes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_quotes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_quotes" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "inv_quote_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_quote_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_quote_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_quote_lines" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "inv_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_transfers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_transfers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_transfers" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "inv_returns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "inv_returns";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inv_returns"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inv_returns" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "asset_gl_postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "asset_gl_postings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "asset_gl_postings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "asset_gl_postings" TO kinetix_app;
  END IF;
END $$;
