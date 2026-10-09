-- Depth for exams (timed paper release, practical sittings, normalisation, class bands), quality (criteria trees, CQI re-measure, evidence harvest),
-- HR (qualifications, teaching evaluation, overtime and arrears, Form 16), fees (instalments, late fees, credits), assets (AMC, smartboards),
-- library (renewals, reservations, lost books, e-resources, topic links), hostel work orders, canteen stock and feedback, retention rules and mentoring follow-up.
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'credit';--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "root_cause" text;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "baseline_value" numeric(12,2);--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "target_value" numeric(12,2);--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "remeasure_on" date;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "remeasured_value" numeric(12,2);--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "remeasure_note" text;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN IF NOT EXISTS "remeasured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "obe_evidence" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD COLUMN IF NOT EXISTS "file_key" text;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD COLUMN IF NOT EXISTS "file_name" text;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD COLUMN IF NOT EXISTS "source_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "obe_evidence_source_uq" ON "obe_evidence" ("tenant_id", "source", "source_ref") WHERE "source" <> 'manual';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "warranty_until" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "serial_no" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "device_id" uuid;--> statement-breakpoint
ALTER TABLE "library_books" ADD COLUMN IF NOT EXISTS "barcode" text;--> statement-breakpoint
ALTER TABLE "library_books" ADD COLUMN IF NOT EXISTS "price_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_books_barcode_uq" ON "library_books" ("tenant_id", "barcode") WHERE "barcode" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "renew_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "condition" text;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "condition_note" text;--> statement-breakpoint
ALTER TABLE "eval_questions" ADD COLUMN IF NOT EXISTS "co_id" uuid;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qb_paper_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "qb_papers"("id") ON DELETE CASCADE,
  "release_at" timestamp with time zone NOT NULL,
  "controller_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'scheduled' NOT NULL,
  "released_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qb_paper_releases_paper_uq" ON "qb_paper_releases" ("paper_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_practical_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "kind" text DEFAULT 'practical' NOT NULL,
  "batch_label" text DEFAULT '' NOT NULL,
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "slot_date" date NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "internal_examiner_id" uuid NOT NULL REFERENCES "users"("id"),
  "external_examiner_name" text DEFAULT '' NOT NULL,
  "external_examiner_org" text DEFAULT '' NOT NULL,
  "max_marks" numeric(6,2) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_practical_slots_session_idx" ON "exam_practical_slots" ("session_id", "slot_date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_practical_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "slot_id" uuid NOT NULL REFERENCES "exam_practical_slots"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "present" boolean,
  "marks" numeric(6,2),
  "remarks" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_practical_candidates_uq" ON "exam_practical_candidates" ("slot_id", "student_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_class_bands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "bands" jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "result_class_bands_tenant_uq" ON "result_class_bands" ("tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mark_normalisations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "method" text NOT NULL,
  "value" numeric(8,3) NOT NULL,
  "affected" integer DEFAULT 0 NOT NULL,
  "before" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "applied_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reverted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accreditation_frameworks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "body" text DEFAULT 'custom' NOT NULL,
  "name" text NOT NULL,
  "version" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accreditation_criteria" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "framework_id" uuid NOT NULL REFERENCES "accreditation_frameworks"("id") ON DELETE CASCADE,
  "parent_id" uuid,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "metric" text DEFAULT '' NOT NULL,
  "unit" text DEFAULT '' NOT NULL,
  "target" numeric(12,2),
  "actual" numeric(12,2),
  "weight" numeric(6,2) DEFAULT 1 NOT NULL,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "harvest_source" text DEFAULT '' NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accreditation_criteria_code_uq" ON "accreditation_criteria" ("framework_id", "code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accreditation_criteria_parent_idx" ON "accreditation_criteria" ("parent_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_qualifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "institution" text DEFAULT '' NOT NULL,
  "year" smallint,
  "level" text DEFAULT '' NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_qualifications_user_idx" ON "staff_qualifications" ("user_id", "kind");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teaching_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "staff_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "academic_year_id" uuid NOT NULL REFERENCES "academic_years"("id"),
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL,
  "rater_kind" text NOT NULL,
  "rater_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scores" jsonb NOT NULL,
  "average" numeric(4,2) NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teaching_evaluations_staff_idx" ON "teaching_evaluations" ("staff_user_id", "academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teaching_evaluations_once_uq" ON "teaching_evaluations" ("staff_user_id", "academic_year_id", "rater_kind", "rater_user_id", COALESCE("subject_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "pay_month" text NOT NULL,
  "hours" numeric(6,2),
  "rate_paise" bigint,
  "amount_paise" bigint NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "run_id" uuid REFERENCES "payroll_runs"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_adjustments_month_idx" ON "payroll_adjustments" ("tenant_id", "pay_month", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_tax_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "tan" text NOT NULL,
  "pan" text NOT NULL,
  "deductor_name" text NOT NULL,
  "deductor_address" text DEFAULT '' NOT NULL,
  "responsible_person" text DEFAULT '' NOT NULL,
  "responsible_designation" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_tax_profile_tenant_uq" ON "payroll_tax_profile" ("tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tds_challans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "financial_year" text NOT NULL,
  "pay_month" text NOT NULL,
  "section" text DEFAULT '192' NOT NULL,
  "bsr_code" text NOT NULL,
  "challan_serial" text NOT NULL,
  "deposited_on" date NOT NULL,
  "tds_paise" bigint NOT NULL,
  "interest_paise" bigint DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tds_challans_uq" ON "tds_challans" ("tenant_id", "bsr_code", "challan_serial");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_instalment_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "parts" jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_instalments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "plan_id" uuid REFERENCES "fee_instalment_plans"("id") ON DELETE SET NULL,
  "seq" smallint NOT NULL,
  "due_on" date NOT NULL,
  "amount_paise" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_instalments_uq" ON "fee_instalments" ("invoice_id", "seq");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_late_fee_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "grace_days" integer DEFAULT 0 NOT NULL,
  "flat_paise" bigint DEFAULT 0 NOT NULL,
  "per_day_paise" bigint DEFAULT 0 NOT NULL,
  "cap_paise" bigint,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_late_fees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "rule_id" uuid REFERENCES "fee_late_fee_rules"("id") ON DELETE SET NULL,
  "days_late" integer NOT NULL,
  "applied_paise" bigint DEFAULT 0 NOT NULL,
  "waived_paise" bigint DEFAULT 0 NOT NULL,
  "waive_reason" text,
  "last_run_on" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_late_fees_invoice_uq" ON "fee_late_fees" ("invoice_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_credits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "kind" text NOT NULL,
  "invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_credits_student_idx" ON "student_credits" ("student_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "amc_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "asset_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL,
  "vendor_id" uuid REFERENCES "inv_vendors"("id") ON DELETE SET NULL,
  "vendor_name" text DEFAULT '' NOT NULL,
  "covers" text DEFAULT '' NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "cost_paise" bigint DEFAULT 0 NOT NULL,
  "visits_per_year" smallint DEFAULT 0 NOT NULL,
  "visits_done" smallint DEFAULT 0 NOT NULL,
  "contact" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "amc_contracts_end_idx" ON "amc_contracts" ("tenant_id", "ends_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "book_id" uuid NOT NULL REFERENCES "library_books"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'waiting' NOT NULL,
  "ready_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "loan_id" uuid REFERENCES "library_loans"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_reservations_book_idx" ON "library_reservations" ("book_id", "status", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_eresources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'ebook' NOT NULL,
  "publisher" text DEFAULT '' NOT NULL,
  "url" text NOT NULL,
  "licence_until" date,
  "seats" integer,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_eresource_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "resource_id" uuid NOT NULL REFERENCES "library_eresources"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_eresource_access_idx" ON "library_eresource_access" ("resource_id", "accessed_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resource_topic_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
  "resource_kind" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resource_topic_links_uq" ON "resource_topic_links" ("topic_id", "resource_kind", "resource_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_work_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "complaint_id" uuid REFERENCES "hostel_complaints"("id") ON DELETE SET NULL,
  "room_id" uuid REFERENCES "hostel_rooms"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "category" text DEFAULT 'general' NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "assignee_name" text DEFAULT '' NOT NULL,
  "assignee_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "due_on" date,
  "cost_paise" bigint DEFAULT 0 NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "completed_at" timestamp with time zone,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_work_orders_status_idx" ON "hostel_work_orders" ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canteen_stock_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "logged_on" date NOT NULL,
  "meal" text,
  "item_name" text NOT NULL,
  "inv_item_id" uuid REFERENCES "inv_items"("id") ON DELETE SET NULL,
  "vendor_id" uuid REFERENCES "inv_vendors"("id") ON DELETE SET NULL,
  "purchase_order_id" uuid REFERENCES "inv_purchase_orders"("id") ON DELETE SET NULL,
  "quantity" numeric(10,2) NOT NULL,
  "unit" text DEFAULT 'kg' NOT NULL,
  "cost_paise" bigint DEFAULT 0 NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canteen_stock_log_idx" ON "canteen_stock_log" ("tenant_id", "logged_on", "kind");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canteen_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "student_id" uuid REFERENCES "students"("id") ON DELETE SET NULL,
  "meal_date" date NOT NULL,
  "meal" text NOT NULL,
  "rating" smallint NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canteen_feedback_uq" ON "canteen_feedback" ("user_id", "meal_date", "meal");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retention_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "data_class" text NOT NULL,
  "retain_months" integer NOT NULL,
  "action" text DEFAULT 'delete' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp with time zone,
  "last_run_count" integer,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "retention_rules_class_uq" ON "retention_rules" ("tenant_id", "data_class");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intervention_support" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan_id" uuid NOT NULL REFERENCES "intervention_plans"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "ref" text,
  "due_on" date,
  "done" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intervention_support_plan_idx" ON "intervention_support" ("plan_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intervention_reassessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan_id" uuid NOT NULL REFERENCES "intervention_plans"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "score_before" smallint NOT NULL,
  "score_after" smallint,
  "signals_before" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "signals_after" jsonb,
  "due_on" date NOT NULL,
  "assessed_at" timestamp with time zone,
  "outcome" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intervention_reassessments_plan_uq" ON "intervention_reassessments" ("plan_id");--> statement-breakpoint
ALTER TABLE "qb_paper_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "qb_paper_releases";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "qb_paper_releases"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "exam_practical_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_practical_slots";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_practical_slots"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "exam_practical_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "exam_practical_candidates";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_practical_candidates"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "result_class_bands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "result_class_bands";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "result_class_bands"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "mark_normalisations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mark_normalisations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mark_normalisations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "accreditation_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "accreditation_frameworks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accreditation_frameworks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "accreditation_criteria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "accreditation_criteria";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "accreditation_criteria"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "staff_qualifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "staff_qualifications";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "staff_qualifications"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "teaching_evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "teaching_evaluations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "teaching_evaluations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "payroll_adjustments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payroll_adjustments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payroll_tax_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "payroll_tax_profile";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payroll_tax_profile"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tds_challans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tds_challans";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tds_challans"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "fee_instalment_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_instalment_plans";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_instalment_plans"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "fee_instalments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_instalments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_instalments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "fee_late_fee_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_late_fee_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_late_fee_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "fee_late_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_late_fees";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_late_fees"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "student_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_credits";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_credits"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "amc_contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "amc_contracts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "amc_contracts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "library_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "library_reservations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "library_reservations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "library_eresources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "library_eresources";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "library_eresources"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "library_eresource_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "library_eresource_access";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "library_eresource_access"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "resource_topic_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "resource_topic_links";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "resource_topic_links"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "hostel_work_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "hostel_work_orders";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "hostel_work_orders"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "canteen_stock_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "canteen_stock_log";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "canteen_stock_log"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "canteen_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "canteen_feedback";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "canteen_feedback"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "retention_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "retention_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "retention_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "intervention_support" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "intervention_support";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "intervention_support"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "intervention_reassessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "intervention_reassessments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "intervention_reassessments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "qb_paper_releases", "exam_practical_slots", "exam_practical_candidates", "result_class_bands", "mark_normalisations", "accreditation_frameworks", "accreditation_criteria", "staff_qualifications", "teaching_evaluations", "payroll_adjustments", "payroll_tax_profile", "tds_challans", "fee_instalment_plans", "fee_instalments", "fee_late_fee_rules", "fee_late_fees", "student_credits", "amc_contracts", "library_reservations", "library_eresources", "library_eresource_access", "resource_topic_links", "hostel_work_orders", "canteen_stock_log", "canteen_feedback", "retention_rules", "intervention_support", "intervention_reassessments" TO kinetix_app;
  END IF;
END $$;
