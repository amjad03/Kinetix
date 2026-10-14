-- Results and academic documents workflow: duplicates of issued documents (affidavit / FIR, fee), out-of-date copies after
-- a correction or grade change, record correction requests, employer verification requests and transferred credits.
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "duplicate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "original_id" uuid;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "affidavit_ref" text;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "fir_no" text;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "fee_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "payment_ref" text;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "academic_doc_requests" ADD COLUMN IF NOT EXISTS "superseded_reason" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "record_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "field" text NOT NULL,
  "current_value" text,
  "requested_value" text NOT NULL,
  "reason" text NOT NULL,
  "document_ref" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "decision_note" text,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "reissued" integer DEFAULT 0 NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_corrections_student_idx" ON "record_corrections" ("student_id");--> statement-breakpoint
ALTER TABLE "record_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "record_corrections";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "record_corrections"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "record_corrections" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "requester_name" text NOT NULL,
  "organisation" text NOT NULL,
  "email" text NOT NULL,
  "serial_no" text NOT NULL,
  "candidate_name" text NOT NULL,
  "fee_paise" bigint DEFAULT 0 NOT NULL,
  "payment_ref" text,
  "status" text DEFAULT 'received' NOT NULL,
  "document_id" uuid,
  "outcome" text,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_requests_status_idx" ON "verification_requests" ("tenant_id", "status");--> statement-breakpoint
ALTER TABLE "verification_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "verification_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "verification_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "verification_requests" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "source_institution" text NOT NULL,
  "source_course" text NOT NULL,
  "subject_id" uuid REFERENCES "subjects"("id"),
  "term" smallint NOT NULL,
  "credits" numeric(4, 1) NOT NULL,
  "grade" text NOT NULL,
  "grade_point" numeric(4, 2) NOT NULL,
  "note" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transfers_student_idx" ON "credit_transfers" ("student_id");--> statement-breakpoint
ALTER TABLE "credit_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "credit_transfers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "credit_transfers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "credit_transfers" TO kinetix_app;
  END IF;
END $$;
