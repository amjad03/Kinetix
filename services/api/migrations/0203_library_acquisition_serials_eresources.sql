-- Library pass, part 2: vendors, purchase orders and invoices for acquisitions; binding batches; e-resources with
-- their consortium (DELNET, N-LIST, e-ShodhSindhu), access by IP or remote login, cost and monthly usage.

CREATE TABLE IF NOT EXISTS "library_vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "kind" text DEFAULT 'books' NOT NULL,
  "gstin" text DEFAULT '' NOT NULL,
  "contact_person" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
  "payment_terms" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_vendors_name_uq" ON "library_vendors" ("tenant_id", lower("name"));--> statement-breakpoint

-- A purchase order to one vendor groups approved acquisition requests (the order's lines).
CREATE TABLE IF NOT EXISTS "library_purchase_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "number" text NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "library_vendors"("id"),
  "ordered_on" date,
  "expected_by" date,
  "discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_purchase_orders_number_uq" ON "library_purchase_orders" ("tenant_id", "number");--> statement-breakpoint

-- A vendor's invoice for one order: gross, trade discount, GST and net; passed for payment, then paid.
CREATE TABLE IF NOT EXISTS "library_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "vendor_id" uuid NOT NULL REFERENCES "library_vendors"("id"),
  "po_id" uuid REFERENCES "library_purchase_orders"("id") ON DELETE set null,
  "invoice_no" text NOT NULL,
  "invoice_date" date NOT NULL,
  "gross_paise" bigint DEFAULT 0 NOT NULL,
  "discount_paise" bigint DEFAULT 0 NOT NULL,
  "gst_paise" bigint DEFAULT 0 NOT NULL,
  "net_paise" bigint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'recorded' NOT NULL,
  "paid_on" date,
  "payment_ref" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_invoices_no_uq" ON "library_invoices" ("tenant_id", "vendor_id", "invoice_no");--> statement-breakpoint

ALTER TABLE "library_acquisitions" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "library_vendors"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "library_acquisitions" ADD COLUMN IF NOT EXISTS "po_id" uuid REFERENCES "library_purchase_orders"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "library_acquisitions" ADD COLUMN IF NOT EXISTS "invoice_id" uuid REFERENCES "library_invoices"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_acquisitions_po_idx" ON "library_acquisitions" ("po_id");--> statement-breakpoint
ALTER TABLE "library_periodicals" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "library_vendors"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "library_periodical_issues" ADD COLUMN IF NOT EXISTS "claim_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "library_periodical_issues" SET "claim_count" = 1 WHERE "claimed_on" IS NOT NULL AND "claim_count" = 0;--> statement-breakpoint

-- Books and journal volumes sent to the binder together, and what each batch held.
CREATE TABLE IF NOT EXISTS "library_binding_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "number" text NOT NULL,
  "vendor_id" uuid REFERENCES "library_vendors"("id") ON DELETE set null,
  "sent_on" date,
  "expected_on" date,
  "received_on" date,
  "status" text DEFAULT 'draft' NOT NULL,
  "cost_paise" bigint DEFAULT 0 NOT NULL,
  "budget_id" uuid REFERENCES "library_budgets"("id") ON DELETE set null,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_binding_batches_number_uq" ON "library_binding_batches" ("tenant_id", "number");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_binding_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "batch_id" uuid NOT NULL REFERENCES "library_binding_batches"("id") ON DELETE cascade,
  "copy_id" uuid REFERENCES "library_copies"("id") ON DELETE cascade,
  "periodical_id" uuid REFERENCES "library_periodicals"("id") ON DELETE cascade,
  "label" text NOT NULL,
  "prior_status" text DEFAULT 'available' NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_binding_items_copy_uq" ON "library_binding_items" ("batch_id", "copy_id");--> statement-breakpoint

-- E-resources: who provides them, how readers get in (campus IP range, remote login, open), cost and usage.
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'publisher' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "access_mode" text DEFAULT 'ip' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "ip_ranges" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "remote_access" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "subjects" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "cost_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "subscription_from" date;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "budget_id" uuid REFERENCES "library_budgets"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "library_eresources" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "library_vendors"("id") ON DELETE set null;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_eresource_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "resource_id" uuid NOT NULL REFERENCES "library_eresources"("id") ON DELETE cascade,
  "month" text NOT NULL,
  "sessions" integer DEFAULT 0 NOT NULL,
  "searches" integer DEFAULT 0 NOT NULL,
  "downloads" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'provider' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_eresource_usage_uq" ON "library_eresource_usage" ("resource_id", "month");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['library_vendors', 'library_purchase_orders', 'library_invoices', 'library_binding_batches', 'library_binding_items', 'library_eresource_usage'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
