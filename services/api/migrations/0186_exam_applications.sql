-- Exam applications by subject, and exam fees through the fee ledger.
-- exam_application_subjects: what a candidate applied to write in a session: this term's papers (regular), failed
-- subjects of earlier sessions (backlog) and passed subjects taken again (improvement), each with its eligibility
-- (attendance in the subject after condonation, internal-marks eligibility, prerequisites) and its fee.
-- exam_fee_dues.fee_invoice_id and revaluation_requests.fee_invoice_id: the invoice in the fees module that carries the
-- exam or revaluation fee, so it is paid at the counter, online or from the apps like any other fee.
CREATE TABLE IF NOT EXISTS "exam_application_subjects" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'eligible',
  "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fee_paise" bigint NOT NULL DEFAULT 0,
  "failed_in_session_id" uuid REFERENCES "exam_sessions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("session_id", "student_id", "subject_id"),
  CONSTRAINT "exam_application_subjects_kind_ck" CHECK ("kind" IN ('regular', 'backlog', 'improvement')),
  CONSTRAINT "exam_application_subjects_status_ck" CHECK ("status" IN ('eligible', 'ineligible', 'withdrawn'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_application_subjects_student_idx" ON "exam_application_subjects" ("student_id");--> statement-breakpoint
ALTER TABLE "exam_registrations" ADD COLUMN IF NOT EXISTS "application_no" text;--> statement-breakpoint
ALTER TABLE "exam_registrations" ADD COLUMN IF NOT EXISTS "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "exam_fee_dues" ADD COLUMN IF NOT EXISTS "fee_invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "revaluation_requests" ADD COLUMN IF NOT EXISTS "fee_invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_fee_dues_invoice_idx" ON "exam_fee_dues" ("fee_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revaluation_requests_invoice_idx" ON "revaluation_requests" ("fee_invoice_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_application_subjects'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
