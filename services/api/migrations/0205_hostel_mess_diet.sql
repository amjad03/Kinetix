-- Hostel pass (2 of 2): the diet system mess bill (the month's mess spending shared by diets eaten), and vacate
-- settlements posted to the student's fee ledger.
CREATE TABLE IF NOT EXISTS "mess_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "month" text NOT NULL,
  "head" text NOT NULL DEFAULT 'provisions',
  "amount_paise" bigint NOT NULL,
  "spent_on" date NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "stock_log_id" uuid REFERENCES "canteen_stock_log"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mess_expenses_month_idx" ON "mess_expenses" ("tenant_id", "month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mess_expenses_stock_uq" ON "mess_expenses" ("stock_log_id") WHERE "stock_log_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "mess_bills" ADD COLUMN IF NOT EXISTS "diets" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "mess_bills" ADD COLUMN IF NOT EXISTS "diet_rate_paise" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "mess_bills" ADD COLUMN IF NOT EXISTS "establishment_paise" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "hostel_settlements" ADD COLUMN IF NOT EXISTS "ledger_posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hostel_settlements" ADD COLUMN IF NOT EXISTS "ledger_ref" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "mess_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mess_expenses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mess_expenses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "mess_expenses" TO zynetix_app;
  END IF;
END $$;
