-- Campus life depth: NSS/NCC units, sports teams and their hours and camps; the student achievements register
-- (NAAC 5.3); extension, outreach, gender and sustainability activities (NAAC 3.4 and 7.1); club budgets and expense
-- claims; student council elections with a secret ballot; event proposals with budget approval, post-event reports,
-- paid and external registrations with refunds on cancellation, and duty leave for participants.

CREATE TABLE IF NOT EXISTS "activity_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'nss' NOT NULL,
  "name" text NOT NULL,
  "sport" text DEFAULT '' NOT NULL,
  "coordinator_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "description" text DEFAULT '' NOT NULL,
  "target_hours" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_units_name_uq" ON "activity_units" ("tenant_id", lower("name"));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "unit_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "unit_id" uuid NOT NULL REFERENCES "activity_units"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "enrolled_on" date NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "left_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unit_members_uq" ON "unit_members" ("unit_id", "student_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "unit_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "unit_id" uuid NOT NULL REFERENCES "activity_units"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'regular' NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "place" text DEFAULT '' NOT NULL,
  "hours" numeric(6, 2) DEFAULT 0 NOT NULL,
  "result" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_activities_unit_idx" ON "unit_activities" ("unit_id", "starts_on");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "unit_hours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "activity_id" uuid NOT NULL REFERENCES "unit_activities"("id") ON DELETE CASCADE,
  "unit_id" uuid NOT NULL REFERENCES "activity_units"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "hours" numeric(6, 2) NOT NULL,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unit_hours_uq" ON "unit_hours" ("activity_id", "student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_hours_student_idx" ON "unit_hours" ("unit_id", "student_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "category" text DEFAULT 'cultural' NOT NULL,
  "level" text DEFAULT 'institution' NOT NULL,
  "position" text DEFAULT 'participation' NOT NULL,
  "event_name" text DEFAULT '' NOT NULL,
  "organiser" text DEFAULT '' NOT NULL,
  "achieved_on" date NOT NULL,
  "team" boolean DEFAULT false NOT NULL,
  "award_paise" bigint DEFAULT 0 NOT NULL,
  "evidence_url" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "notes" text DEFAULT '' NOT NULL,
  "unit_id" uuid REFERENCES "activity_units"("id") ON DELETE SET NULL,
  "club_id" uuid REFERENCES "clubs"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_achievements_student_idx" ON "student_achievements" ("student_id", "achieved_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_achievements_level_idx" ON "student_achievements" ("tenant_id", "level", "achieved_on");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outreach_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'extension' NOT NULL,
  "organised_by" text DEFAULT '' NOT NULL,
  "agency" text DEFAULT '' NOT NULL,
  "held_on" date NOT NULL,
  "ends_on" date,
  "place" text DEFAULT '' NOT NULL,
  "students_count" integer DEFAULT 0 NOT NULL,
  "staff_count" integer DEFAULT 0 NOT NULL,
  "beneficiaries" integer DEFAULT 0 NOT NULL,
  "unit_id" uuid REFERENCES "activity_units"("id") ON DELETE SET NULL,
  "description" text DEFAULT '' NOT NULL,
  "outcome" text DEFAULT '' NOT NULL,
  "evidence_url" text DEFAULT '' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_activities_held_idx" ON "outreach_activities" ("tenant_id", "held_on");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "club_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "year_label" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "set_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_budgets_uq" ON "club_budgets" ("club_id", "year_label");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "club_expense_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "year_label" text NOT NULL,
  "title" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "spent_on" date NOT NULL,
  "payee" text DEFAULT '' NOT NULL,
  "bill_no" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "decision_note" text DEFAULT '' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "paid_on" date,
  "payment_ref" text DEFAULT '' NOT NULL,
  "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_expense_claims_club_idx" ON "club_expense_claims" ("club_id", "year_label");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "elections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "program_ids" uuid[],
  "voting_starts_at" timestamp with time zone NOT NULL,
  "voting_ends_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "election_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "election_id" uuid NOT NULL REFERENCES "elections"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "seats" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "election_posts_election_idx" ON "election_posts" ("election_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "election_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "post_id" uuid NOT NULL REFERENCES "election_posts"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "manifesto" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'approved' NOT NULL,
  "votes" integer DEFAULT 0 NOT NULL,
  "elected" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "election_candidates_uq" ON "election_candidates" ("post_id", "student_id");--> statement-breakpoint

-- Who has voted (no choices here) and the ballots (no voter here): the vote stays secret.
CREATE TABLE IF NOT EXISTS "election_voters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "election_id" uuid NOT NULL REFERENCES "elections"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "voted_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "election_voters_uq" ON "election_voters" ("election_id", "student_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "election_ballots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "election_id" uuid NOT NULL REFERENCES "elections"("id") ON DELETE CASCADE,
  "post_id" uuid NOT NULL REFERENCES "election_posts"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL REFERENCES "election_candidates"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "election_ballots_post_idx" ON "election_ballots" ("post_id", "candidate_id");--> statement-breakpoint

-- Events: proposal and budget approval, the report afterwards, external registrations and refunds.
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "budget_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "approval_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "external_registration" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "report" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "report_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "spent_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_events" ADD COLUMN IF NOT EXISTS "cancel_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "paid_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "payment_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "refund_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "refund_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "event_external_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "campus_events"("id") ON DELETE CASCADE,
  "full_name" text NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "institution" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'registered' NOT NULL,
  "paid_paise" bigint DEFAULT 0 NOT NULL,
  "payment_ref" text DEFAULT '' NOT NULL,
  "refund_status" text DEFAULT 'none' NOT NULL,
  "refund_ref" text DEFAULT '' NOT NULL,
  "refunded_at" timestamp with time zone,
  "qr_token" text NOT NULL,
  "checked_in_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_external_registrations_token_uq" ON "event_external_registrations" ("qr_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_external_registrations_event_idx" ON "event_external_registrations" ("event_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "event_duty_leaves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "campus_events"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "role" text DEFAULT 'participant' NOT NULL,
  "leave_request_id" uuid REFERENCES "student_leave_requests"("id") ON DELETE SET NULL,
  "excused_count" integer DEFAULT 0 NOT NULL,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_duty_leaves_uq" ON "event_duty_leaves" ("event_id", "student_id");--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['activity_units', 'unit_members', 'unit_activities', 'unit_hours', 'student_achievements', 'outreach_activities', 'club_budgets', 'club_expense_claims', 'elections', 'election_posts', 'election_candidates', 'election_voters', 'election_ballots', 'event_external_registrations', 'event_duty_leaves'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
