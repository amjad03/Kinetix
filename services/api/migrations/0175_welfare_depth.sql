-- Grievance, mentoring and welfare depth: routing rules per category, a grievance about a named person (routed away
-- from them), appeals to the next level, anti-ragging undertakings, disability accommodations for exams, the
-- mentor-mentee channel and the rules that find slow and advanced learners.

-- Caste discrimination goes to the SC/ST cell; free-ship and the poor students fund are welfare kinds.
ALTER TABLE "grievance_tickets" DROP CONSTRAINT IF EXISTS "grievance_tickets_category_ck";--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD CONSTRAINT "grievance_tickets_category_ck" CHECK (category IN ('academic', 'exam', 'fees', 'hostel', 'transport', 'infrastructure', 'staff_conduct', 'ragging', 'harassment', 'discrimination', 'other'));--> statement-breakpoint
ALTER TABLE "grievance_tickets" DROP CONSTRAINT IF EXISTS "grievance_tickets_committee_ck";--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD CONSTRAINT "grievance_tickets_committee_ck" CHECK (committee IS NULL OR committee IN ('anti_ragging', 'icc', 'posh', 'sc_st'));--> statement-breakpoint
ALTER TABLE "welfare_requests" DROP CONSTRAINT IF EXISTS "welfare_requests_kind_ck";--> statement-breakpoint
ALTER TABLE "welfare_requests" ADD CONSTRAINT "welfare_requests_kind_ck" CHECK (kind IN ('scholarship', 'fee_waiver', 'freeship', 'poor_fund', 'medical_aid', 'hardship', 'other'));--> statement-breakpoint

ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "against_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "appeal_reason" text;--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "appealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "appeal_status" text;--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "appeal_decision" text;--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "appeal_decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "grievance_tickets" ADD COLUMN IF NOT EXISTS "appeal_decided_at" timestamp with time zone;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "grievance_routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "assignee_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "backup_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "sla_hours" integer,
  "notes" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grievance_routes_category_uq" ON "grievance_routes" ("tenant_id", "category");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "antiragging_undertakings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "year_label" text NOT NULL,
  "student_ref" text DEFAULT '' NOT NULL,
  "parent_ref" text DEFAULT '' NOT NULL,
  "submitted_on" date,
  "status" text DEFAULT 'pending' NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "antiragging_undertakings_uq" ON "antiragging_undertakings" ("student_id", "year_label");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "pwd_accommodations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "disability" text NOT NULL,
  "percent" integer,
  "certificate_no" text DEFAULT '' NOT NULL,
  "scribe" boolean DEFAULT false NOT NULL,
  "extra_minutes_per_hour" integer DEFAULT 0 NOT NULL,
  "separate_room" boolean DEFAULT false NOT NULL,
  "ground_floor" boolean DEFAULT false NOT NULL,
  "other" text DEFAULT '' NOT NULL,
  "valid_until" date,
  "status" text DEFAULT 'active' NOT NULL,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pwd_accommodations_student_idx" ON "pwd_accommodations" ("student_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mentor_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "assignment_id" uuid NOT NULL REFERENCES "mentor_assignments"("id") ON DELETE CASCADE,
  "sender_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentor_messages_assignment_idx" ON "mentor_messages" ("assignment_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "learner_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "slow_below_pct" integer DEFAULT 40 NOT NULL,
  "advanced_from_pct" integer DEFAULT 75 NOT NULL,
  "min_assessments" integer DEFAULT 2 NOT NULL,
  "attendance_below_pct" integer DEFAULT 0 NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learner_rules_tenant_uq" ON "learner_rules" ("tenant_id");--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grievance_routes', 'antiragging_undertakings', 'pwd_accommodations', 'mentor_messages', 'learner_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
