-- Governance pass: statutory committees (kind, mandate, meeting norm, quorum, the order that constituted them, public
-- contact), outside members without an account, meeting notice, attendance, agenda items with resolutions, minutes
-- circulated and signed by the members, the action-taken report; policies with versions, four-eyes approval and
-- acknowledgement; and the RTI register.
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'other' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "mandate" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "meetings_per_year" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "quorum_pct" smallint DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "constituted_on" date;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "order_ref" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "public" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "helpline" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committees" DROP CONSTRAINT IF EXISTS "committees_norms_ck";
--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_norms_ck" CHECK ("meetings_per_year" BETWEEN 0 AND 52 AND "quorum_pct" BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE "committee_members" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" ADD COLUMN IF NOT EXISTS "name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'internal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" ADD COLUMN IF NOT EXISTS "gender" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" ADD COLUMN IF NOT EXISTS "designation" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" ADD COLUMN IF NOT EXISTS "contact_public" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_members" DROP CONSTRAINT IF EXISTS "committee_members_who_ck";
--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_who_ck" CHECK (("user_id" IS NOT NULL OR "name" <> '') AND "gender" IN ('', 'female', 'male', 'other'));
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "venue" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "starts_at" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "notice_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "minutes_status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "minutes_hash" text;
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "minutes_circulated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD COLUMN IF NOT EXISTS "minutes_approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "committee_meetings" DROP CONSTRAINT IF EXISTS "committee_meetings_minutes_ck";
--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD CONSTRAINT "committee_meetings_minutes_ck" CHECK ("minutes_status" IN ('draft', 'circulated', 'approved'));
--> statement-breakpoint
ALTER TABLE "committee_action_items" ADD COLUMN IF NOT EXISTS "agenda_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "committee_action_items" ADD COLUMN IF NOT EXISTS "action_taken" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "committee_action_items" ADD COLUMN IF NOT EXISTS "reported_on" date;
--> statement-breakpoint
ALTER TABLE "committee_action_items" ADD COLUMN IF NOT EXISTS "evidence_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_meeting_attendance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "committee_meetings"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "committee_members"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'present' NOT NULL CHECK ("status" IN ('present', 'absent', 'leave')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "committee_meeting_attendance_uq" ON "committee_meeting_attendance" ("meeting_id", "member_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_agenda_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "committee_meetings"("id") ON DELETE CASCADE,
  "seq" smallint NOT NULL CHECK ("seq" > 0),
  "title" text NOT NULL,
  "presenter" text DEFAULT '' NOT NULL,
  "discussion" text DEFAULT '' NOT NULL,
  "resolution" text DEFAULT '' NOT NULL,
  "outcome" text DEFAULT 'pending' NOT NULL CHECK ("outcome" IN ('pending', 'resolved', 'deferred', 'noted', 'rejected')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "committee_agenda_items_seq_uq" ON "committee_agenda_items" ("meeting_id", "seq");
--> statement-breakpoint
ALTER TABLE "committee_action_items" DROP CONSTRAINT IF EXISTS "committee_action_items_agenda_fk";
--> statement-breakpoint
ALTER TABLE "committee_action_items" ADD CONSTRAINT "committee_action_items_agenda_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "committee_agenda_items"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_minute_signoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meeting_id" uuid NOT NULL REFERENCES "committee_meetings"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "committee_members"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decision" text NOT NULL CHECK ("decision" IN ('approve', 'object')),
  "comment" text DEFAULT '' NOT NULL,
  "minutes_hash" text NOT NULL,
  "signature" text NOT NULL,
  "signed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "committee_minute_signoffs_uq" ON "committee_minute_signoffs" ("meeting_id", "member_id", "minutes_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "category" text DEFAULT 'other' NOT NULL,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "review_months" smallint DEFAULT 24 NOT NULL CHECK ("review_months" BETWEEN 1 AND 120),
  "next_review_on" date,
  "public" boolean DEFAULT false NOT NULL,
  "audience" text[] DEFAULT '{}'::text[] NOT NULL,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active', 'retired')),
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "governance_policies_code_uq" ON "governance_policies" ("tenant_id", "code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "policy_id" uuid NOT NULL REFERENCES "governance_policies"("id") ON DELETE CASCADE,
  "version" integer NOT NULL CHECK ("version" > 0),
  "body" text NOT NULL,
  "change_note" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft', 'in_review', 'approved', 'published', 'superseded')),
  "effective_from" date,
  "authored_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "content_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "governance_policy_versions_uq" ON "governance_policy_versions" ("policy_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_policy_versions_status_idx" ON "governance_policy_versions" ("tenant_id", "status");
--> statement-breakpoint
-- At most one published version of a policy at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "governance_policy_versions_published_uq" ON "governance_policy_versions" ("policy_id") WHERE "status" = 'published';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_policy_acks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "governance_policy_versions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "acknowledged_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "governance_policy_acks_uq" ON "governance_policy_acks" ("version_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_policy_acks_user_idx" ON "governance_policy_acks" ("tenant_id", "user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rti_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "request_no" text NOT NULL,
  "applicant_name" text NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "received_on" date NOT NULL,
  "mode" text DEFAULT 'post' NOT NULL CHECK ("mode" IN ('post', 'online', 'in_person', 'email')),
  "via_apio" boolean DEFAULT false NOT NULL,
  "life_liberty" boolean DEFAULT false NOT NULL,
  "bpl" boolean DEFAULT false NOT NULL,
  "fee_paise" bigint DEFAULT 0 NOT NULL CHECK ("fee_paise" >= 0),
  "fee_ref" text DEFAULT '' NOT NULL,
  "subject" text NOT NULL,
  "information" text NOT NULL,
  "pio_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "due_on" date NOT NULL,
  "status" text DEFAULT 'received' NOT NULL CHECK ("status" IN ('received', 'transferred', 'replied', 'rejected', 'closed')),
  "transferred_to" text DEFAULT '' NOT NULL,
  "transferred_on" date,
  "additional_fee_paise" bigint DEFAULT 0 NOT NULL CHECK ("additional_fee_paise" >= 0),
  "reply" text DEFAULT '' NOT NULL,
  "replied_on" date,
  "rejection_section" text DEFAULT '' NOT NULL,
  "appeal_filed_on" date,
  "appeal_grounds" text DEFAULT '' NOT NULL,
  "appeal_due_on" date,
  "faa_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "appeal_decision" text DEFAULT '' NOT NULL,
  "appeal_outcome" text DEFAULT '' NOT NULL CHECK ("appeal_outcome" IN ('', 'allowed', 'partly_allowed', 'dismissed')),
  "appeal_decided_on" date,
  "second_appeal" boolean DEFAULT false NOT NULL,
  "last_reminded_on" date,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rti_requests_no_uq" ON "rti_requests" ("tenant_id", "request_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rti_requests_due_idx" ON "rti_requests" ("tenant_id", "status", "due_on");
--> statement-breakpoint
ALTER TABLE "committee_meeting_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_meeting_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_meeting_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_meeting_attendance" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "committee_agenda_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_agenda_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_agenda_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_agenda_items" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "committee_minute_signoffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "committee_minute_signoffs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "committee_minute_signoffs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "committee_minute_signoffs" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "governance_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "governance_policies";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "governance_policies"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "governance_policies" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "governance_policy_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "governance_policy_versions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "governance_policy_versions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "governance_policy_versions" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "governance_policy_acks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "governance_policy_acks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "governance_policy_acks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "governance_policy_acks" TO zynetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "rti_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "rti_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rti_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "rti_requests" TO zynetix_app;
  END IF;
END $$;
