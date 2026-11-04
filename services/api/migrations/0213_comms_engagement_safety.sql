-- Communication pass: translated notices with a quick poll and outside channels, event RSVPs, chat moderation
-- (reports, hidden messages, blocks), escalation to the head of department, staff do-not-disturb, PTM minutes.
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "translations" jsonb NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "poll" jsonb;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "external" jsonb;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_poll_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "option" smallint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_poll_votes_uq" ON "announcement_poll_votes" ("announcement_id", "user_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "rsvp" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "rsvp_by" date;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "capacity" integer;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "venue" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_event_rsvps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "calendar_events"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "response" text NOT NULL,
  "guests" smallint NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_rsvps_uq" ON "calendar_event_rsvps" ("event_id", "user_id");--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "flag" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "hidden_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "reported_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "action" text,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "resolution_note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_reports_status_idx" ON "message_reports" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_reports_once_uq" ON "message_reports" ("message_id", "reported_by");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "staff_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "until" timestamp with time zone,
  "lifted_at" timestamp with time zone,
  "lifted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_blocks_user_idx" ON "chat_blocks" ("user_id") WHERE "lifted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "escalated_to" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "escalation_reason" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "dnd_until" timestamp with time zone,
  "hours" jsonb,
  "away_note" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_availability_user_uq" ON "chat_availability" ("user_id");--> statement-breakpoint
ALTER TABLE "ptm_slots" ADD COLUMN IF NOT EXISTS "attendance" text;--> statement-breakpoint
ALTER TABLE "ptm_slots" ADD COLUMN IF NOT EXISTS "minutes" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "ptm_slots" ADD COLUMN IF NOT EXISTS "action_points" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "ptm_slots" ADD COLUMN IF NOT EXISTS "minutes_at" timestamp with time zone;--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['announcement_poll_votes', 'calendar_event_rsvps', 'message_reports', 'chat_blocks', 'chat_availability'] LOOP
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
