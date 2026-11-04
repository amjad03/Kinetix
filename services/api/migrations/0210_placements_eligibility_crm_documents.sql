-- Placements pass: further drive eligibility (gender, class 10 and 12 percentages, gap years, backlog history, verified
-- documents), the recruiter relationship stage and owner, the interaction log with follow-ups, and students'
-- placement documents with the cell's verification; a registration remembers the resume it was made with.
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "genders" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "min_tenth_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "min_twelfth_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "max_gap_years" smallint;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "max_backlog_history" smallint;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "require_verified_docs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_drives" ADD COLUMN IF NOT EXISTS "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "placement_drives" DROP CONSTRAINT IF EXISTS "placement_drives_pct_ck";--> statement-breakpoint
ALTER TABLE "placement_drives" ADD CONSTRAINT "placement_drives_pct_ck" CHECK (coalesce("min_tenth_pct", 0) BETWEEN 0 AND 100 AND coalesce("min_twelfth_pct", 0) BETWEEN 0 AND 100 AND coalesce("max_gap_years", 0) >= 0 AND coalesce("max_backlog_history", 0) >= 0);--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "crm_stage" text DEFAULT 'prospect' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement_companies" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "placement_companies" DROP CONSTRAINT IF EXISTS "placement_companies_crm_stage_ck";--> statement-breakpoint
ALTER TABLE "placement_companies" ADD CONSTRAINT "placement_companies_crm_stage_ck" CHECK ("crm_stage" IN ('prospect', 'contacted', 'engaged', 'recruiting', 'dormant'));--> statement-breakpoint
UPDATE "placement_companies" c SET "crm_stage" = 'recruiting' WHERE EXISTS (SELECT 1 FROM "placement_drives" d WHERE d.company_id = c.id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "placement_companies"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "placement_company_contacts"("id") ON DELETE SET NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('call', 'email', 'meeting', 'campus_visit', 'linkedin', 'other')),
  "happened_on" date NOT NULL,
  "summary" text NOT NULL,
  "outcome" text DEFAULT '' NOT NULL,
  "next_action" text DEFAULT '' NOT NULL,
  "follow_up_on" date,
  "follow_up_done" boolean DEFAULT false NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_interactions_company_idx" ON "placement_interactions" ("company_id", "happened_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_interactions_follow_up_idx" ON "placement_interactions" ("tenant_id", "follow_up_on");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('resume', 'marks_10', 'marks_12', 'diploma', 'semester_marks', 'id_proof', 'photo', 'other')),
  "title" text NOT NULL,
  "storage_key" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL CHECK ("size_bytes" > 0),
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'verified', 'rejected')),
  "reject_reason" text,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_documents_student_idx" ON "placement_documents" ("student_id", "kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_documents_status_idx" ON "placement_documents" ("tenant_id", "status");--> statement-breakpoint
ALTER TABLE "drive_registrations" ADD COLUMN IF NOT EXISTS "resume_document_id" uuid REFERENCES "placement_documents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "placement_interactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_interactions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_interactions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_interactions" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "placement_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "placement_documents";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "placement_documents"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "placement_documents" TO zynetix_app;
  END IF;
END $$;
