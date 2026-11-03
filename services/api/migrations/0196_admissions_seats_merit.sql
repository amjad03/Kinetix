-- Admissions pass: the reservation matrix (seat type × category with horizontal and supernumerary seats), entrance-test
-- merit, seats allotted by an outside counselling authority (KEA, COMEDK), claims, and programme approvals.
--
-- admission_seat_matrix gains the seat type (government/CET 'merit', COMEDK, management, NRI), the horizontal seats
-- earmarked inside a row, whether the row is supernumerary, and the unique key now includes the seat type.
ALTER TABLE "admission_seat_matrix" ADD COLUMN IF NOT EXISTS "seat_type" text NOT NULL DEFAULT 'merit';--> statement-breakpoint
ALTER TABLE "admission_seat_matrix" ADD COLUMN IF NOT EXISTS "horizontal" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "admission_seat_matrix" ADD COLUMN IF NOT EXISTS "supernumerary" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "admission_seat_matrix" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;--> statement-breakpoint
DROP INDEX IF EXISTS "admission_seat_matrix_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_seat_matrix_uq" ON "admission_seat_matrix" ("cycle_id", "option_label", "seat_type", "category");--> statement-breakpoint

ALTER TABLE "admission_allotments" ADD COLUMN IF NOT EXISTS "seat_type" text NOT NULL DEFAULT 'merit';--> statement-breakpoint
ALTER TABLE "admission_allotments" ADD COLUMN IF NOT EXISTS "horizontal" text;--> statement-breakpoint

-- De-reservation moves made between rounds, kept for the seat-matrix history and the approval returns.
CREATE TABLE IF NOT EXISTS "admission_seat_conversions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "admission_cycles"("id") ON DELETE CASCADE,
  "after_round" integer NOT NULL,
  "option_label" text NOT NULL,
  "from_seat_type" text NOT NULL,
  "from_category" text NOT NULL,
  "to_seat_type" text NOT NULL,
  "to_category" text NOT NULL,
  "seats" integer NOT NULL,
  "reason" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_seat_conversions_cycle_idx" ON "admission_seat_conversions" ("cycle_id", "created_at");--> statement-breakpoint

-- The applicant's entrance test, claims and allotted seat.
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "entrance_exam" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "entrance_roll_no" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "entrance_rank" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "entrance_score" numeric(9, 3);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "claims" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "seat_type" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "seat_category" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "allotted_option" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "external_allotment_ref" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "eligibility_preset" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "applications_external_allotment_uq" ON "applications" ("tenant_id", "external_allotment_ref") WHERE "external_allotment_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_seat_idx" ON "applications" ("cycle_id", "seat_type", "seat_category");--> statement-breakpoint

-- Per programme: the branch code in register numbers, the sanctioned intake and the approval it rests on (AICTE, the
-- university's affiliation order), shown on the approval returns.
CREATE TABLE IF NOT EXISTS "admission_programme_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "branch_code" text,
  "sanctioned_intake" integer,
  "approval_body" text,
  "approval_ref" text,
  "approval_valid_to" date,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_programme_settings_uq" ON "admission_programme_settings" ("program_id");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admission_seat_conversions', 'admission_programme_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
