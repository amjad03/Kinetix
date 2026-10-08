CREATE TABLE "scholarship_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"value" bigint NOT NULL,
	"min_percentage" numeric(5,2),
	"max_income_paise" bigint,
	"valid_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scholarship_kind_ck" CHECK (kind IN ('percent', 'fixed')),
	CONSTRAINT "scholarship_value_ck" CHECK (value > 0 AND (kind <> 'percent' OR value <= 100))
);
--> statement-breakpoint
CREATE TABLE "scholarship_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"scheme_id" uuid NOT NULL REFERENCES "scholarship_schemes"("id"),
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"income_paise" bigint,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL REFERENCES "users"("id"),
	"decided_by" uuid REFERENCES "users"("id"),
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"awarded_paise" bigint DEFAULT 0 NOT NULL,
	"adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scholarship_app_status_ck" CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scholarship_app_open_uq" ON "scholarship_applications" USING btree ("scheme_id","student_id") WHERE status IN ('pending', 'approved');--> statement-breakpoint
CREATE INDEX "scholarship_app_status_idx" ON "scholarship_applications" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE TABLE "fee_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"payment_id" uuid NOT NULL REFERENCES "fee_payments"("id"),
	"invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id"),
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"amount_paise" bigint NOT NULL CHECK (amount_paise > 0),
	"reason" text NOT NULL,
	"refunded_by" uuid NOT NULL REFERENCES "users"("id"),
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fee_refunds_payment_idx" ON "fee_refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"department_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE cascade,
	"fiscal_year" text NOT NULL,
	"amount_paise" bigint NOT NULL CHECK (amount_paise >= 0),
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_dept_year_uq" UNIQUE ("department_id", "fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "cost_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"department_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE cascade,
	"spent_on" date NOT NULL,
	"description" text NOT NULL,
	"amount_paise" bigint NOT NULL CHECK (amount_paise > 0),
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cost_expenses_dept_idx" ON "cost_expenses" USING btree ("department_id","spent_on");--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD COLUMN "department_id" uuid REFERENCES "departments"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "scholarship_schemes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "scholarship_schemes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "scholarship_schemes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "scholarship_schemes" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "scholarship_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "scholarship_applications";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "scholarship_applications"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "scholarship_applications" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "fee_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_refunds";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_refunds"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_refunds" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "budgets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "budgets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "budgets" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "cost_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "cost_expenses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "cost_expenses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "cost_expenses" TO kinetix_app;
  END IF;
END $$;
