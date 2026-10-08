-- Bank-transfer payment submissions, sponsor (PO) billing and online class meetings.
CREATE TABLE IF NOT EXISTS "bank_transfer_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id"),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "submitted_by" uuid NOT NULL REFERENCES "users"("id"),
  "amount_paise" bigint NOT NULL,
  "utr" text NOT NULL,
  "transfer_date" date NOT NULL,
  "proof_key" text,
  "proof_type" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "payment_id" uuid REFERENCES "fee_payments"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_transfer_status_idx" ON "bank_transfer_submissions" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transfer_utr_live_uq" ON "bank_transfer_submissions" ("tenant_id", lower("utr")) WHERE "status" <> 'rejected';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "contact_name" text,
  "contact_email" text,
  "gstin" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sponsors_name_uq" ON "sponsors" ("tenant_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sponsor_id" uuid NOT NULL REFERENCES "sponsors"("id"),
  "invoice_no" text NOT NULL,
  "po_number" text,
  "title" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "paid_paise" bigint DEFAULT 0 NOT NULL,
  "due_on" date NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_invoices_no_uq" ON "sponsor_invoices" ("tenant_id", "invoice_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsor_invoices_sponsor_idx" ON "sponsor_invoices" ("sponsor_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "sponsor_invoices"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "description" text NOT NULL,
  "amount_paise" bigint NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "sponsor_invoices"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "method" text NOT NULL,
  "reference" text,
  "received_on" date NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "connector_id" uuid REFERENCES "connectors"("id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "slot_id" uuid REFERENCES "timetable_slots"("id") ON DELETE SET NULL,
  "topic" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "duration_min" integer NOT NULL,
  "external_id" text NOT NULL,
  "join_url" text NOT NULL,
  "host_url" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_meetings_slot_idx" ON "class_meetings" ("slot_id", "starts_at");--> statement-breakpoint
ALTER TABLE "bank_transfer_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "bank_transfer_submissions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "bank_transfer_submissions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sponsors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sponsors";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sponsors"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sponsor_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sponsor_invoices";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sponsor_invoices"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sponsor_invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sponsor_invoice_lines";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sponsor_invoice_lines"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sponsor_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sponsor_payments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sponsor_payments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "class_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "class_meetings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "class_meetings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "bank_transfer_submissions", "sponsors", "sponsor_invoices", "sponsor_invoice_lines", "sponsor_payments", "class_meetings" TO kinetix_app;
  END IF;
END $$;
