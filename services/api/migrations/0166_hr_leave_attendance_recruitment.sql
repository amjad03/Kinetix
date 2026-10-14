-- Leave rules (kinds, notice, maximum per request, document, gender, sandwich rule, order), leave applied on
-- someone's behalf with a delegate and a supporting document, compensatory-off credits, attendance late/early
-- minutes and regularisation requests, applicant screening, interviews with panel scores, and the appraisal
-- committee and student-feedback steps.
ALTER TABLE "leave_types"
  ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'regular' NOT NULL,
  ADD COLUMN IF NOT EXISTS "max_per_request" numeric(5, 1),
  ADD COLUMN IF NOT EXISTS "min_notice_days" smallint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "requires_document" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "gender" text DEFAULT 'any' NOT NULL,
  ADD COLUMN IF NOT EXISTS "counts_holidays" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "half_day_allowed" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "valid_days" smallint DEFAULT 90 NOT NULL,
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "leave_types" l SET "sort_order" = s.n * 10, "kind" = CASE WHEN l.paid THEN 'regular' ELSE 'unpaid' END FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY code) AS n FROM "leave_types") s WHERE s.id = l.id;--> statement-breakpoint
ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "applied_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "delegate_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "delegation_id" uuid REFERENCES "approval_delegations"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "document_key" text,
  ADD COLUMN IF NOT EXISTS "document_type" text,
  ADD COLUMN IF NOT EXISTS "document_name" text,
  ADD COLUMN IF NOT EXISTS "revoked_reason" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comp_off_credits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "worked_on" date NOT NULL,
  "days" numeric(3, 1) DEFAULT 1 NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_on" date NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comp_off_credits_day_uq" ON "comp_off_credits" ("user_id", "worked_on") WHERE "status" <> 'rejected';--> statement-breakpoint
ALTER TABLE "staff_attendance"
  ADD COLUMN IF NOT EXISTS "late_minutes" smallint,
  ADD COLUMN IF NOT EXISTS "early_minutes" smallint,
  ADD COLUMN IF NOT EXISTS "regularised" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_regularisations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "kind" text DEFAULT 'missed_punch' NOT NULL,
  "in_time" text,
  "out_time" text,
  "requested_status" text DEFAULT 'present' NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_regularisations_idx" ON "attendance_regularisations" ("tenant_id", "status", "date");--> statement-breakpoint
ALTER TABLE "job_applicants"
  ADD COLUMN IF NOT EXISTS "qualification" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "experience_years" numeric(4, 1),
  ADD COLUMN IF NOT EXISTS "phd" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "net_set" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "current_organisation" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "expected_ctc_paise" bigint,
  ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'direct' NOT NULL,
  ADD COLUMN IF NOT EXISTS "screening_score" numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "resume_key" text,
  ADD COLUMN IF NOT EXISTS "resume_type" text,
  ADD COLUMN IF NOT EXISTS "resume_name" text,
  ADD COLUMN IF NOT EXISTS "hired_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "applicant_id" uuid NOT NULL REFERENCES "job_applicants"("id") ON DELETE CASCADE,
  "round" smallint DEFAULT 1 NOT NULL,
  "kind" text DEFAULT 'interview' NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "mode" text DEFAULT 'in_person' NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "panel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_interviews_applicant_idx" ON "job_interviews" ("applicant_id", "round");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_interview_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "interview_id" uuid NOT NULL REFERENCES "job_interviews"("id") ON DELETE CASCADE,
  "panelist_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scores" jsonb NOT NULL,
  "total" numeric(5, 2) NOT NULL,
  "recommendation" text NOT NULL,
  "remarks" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_interview_scores_uq" ON "job_interview_scores" ("interview_id", "panelist_id");--> statement-breakpoint
ALTER TABLE "appraisals"
  ADD COLUMN IF NOT EXISTS "student_feedback_score" numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "committee_score" numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "committee_remarks" text,
  ADD COLUMN IF NOT EXISTS "committee_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "committee_at" timestamp with time zone;--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['comp_off_credits', 'attendance_regularisations', 'job_interviews', 'job_interview_scores'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
