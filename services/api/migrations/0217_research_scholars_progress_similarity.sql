-- Research pass, part 2: Ph.D. registration detail (registration number, mode, department, centre, fellowship, entrance,
-- gender and category for AISHE, coursework and synopsis dates), six-monthly progress reports, the external similarity
-- report (URKUND / Ouriginal, DrillBit, Turnitin) with its UGC 2018 level, the Shodhganga deposit, and what a seminar,
-- workshop or conference organised was about (for NAAC 3.2.2) with its participants and sponsor.
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "registration_no" text;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'full_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "centre_id" uuid REFERENCES "research_centres"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "fellowship" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "fellowship_agency" text;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "entrance" text;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "gender" text;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "coursework_completed_on" date;--> statement-breakpoint
ALTER TABLE "research_scholars" ADD COLUMN IF NOT EXISTS "synopsis_approved_on" date;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_scholars_regno_uq" ON "research_scholars" ("tenant_id", "registration_no") WHERE "registration_no" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scholar_progress_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scholar_id" uuid NOT NULL REFERENCES "research_scholars"("id") ON DELETE CASCADE,
  "period_from" date NOT NULL,
  "period_to" date NOT NULL,
  "submitted_on" date NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "outputs" text,
  "supervisor_remarks" text,
  "rating" text,
  "status" text DEFAULT 'submitted' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scholar_progress_reports_period_ck" CHECK ("period_to" > "period_from")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scholar_progress_reports_uq" ON "scholar_progress_reports" ("scholar_id", "period_from");--> statement-breakpoint
ALTER TABLE "scholar_progress_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "scholar_progress_reports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "scholar_progress_reports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "scholar_progress_reports" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "similarity_checks" ADD COLUMN IF NOT EXISTS "report_ref" text;--> statement-breakpoint
ALTER TABLE "similarity_checks" ADD COLUMN IF NOT EXISTS "report_url" text;--> statement-breakpoint
ALTER TABLE "similarity_checks" ADD COLUMN IF NOT EXISTS "level" text;--> statement-breakpoint
ALTER TABLE "thesis_records" ADD COLUMN IF NOT EXISTS "shodhganga_handle" text;--> statement-breakpoint
ALTER TABLE "thesis_records" ADD COLUMN IF NOT EXISTS "shodhganga_deposited_on" date;--> statement-breakpoint
ALTER TABLE "thesis_records" ADD COLUMN IF NOT EXISTS "awarded_on" date;--> statement-breakpoint
ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "event_kind" text DEFAULT 'conference' NOT NULL;--> statement-breakpoint
ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "theme" text DEFAULT 'subject' NOT NULL;--> statement-breakpoint
ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "ends_on" date;--> statement-breakpoint
ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "participants" integer;--> statement-breakpoint
ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "sponsor" text;--> statement-breakpoint
ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "sponsored_paise" bigint DEFAULT 0 NOT NULL;
