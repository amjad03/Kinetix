-- QR self-marking with anti-proxy checks: every scan is logged with the phone it came from and where it was made.
-- A student's phone is bound on the first scan; a scan from another phone, from outside the campus geofence, with a
-- poor location fix or late in the period is held for the teacher to accept or reject instead of being marked.
-- One phone marking two students in the same period is refused. Classroom readers (biometric, RFID, face) record
-- taps against the period in their room; the teacher confirms them on the mark sheet.
CREATE TABLE IF NOT EXISTS "attendance_qr_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "timetable_slot_id" uuid NOT NULL REFERENCES "timetable_slots"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  -- SHA-256 of the app's install id (never the raw id).
  "device_hash" text,
  "lat" numeric(9, 6),
  "lng" numeric(9, 6),
  "accuracy_m" integer,
  "distance_m" integer,
  -- accepted: marked present; flagged: held for review; refused: nothing recorded.
  "outcome" text NOT NULL,
  "reasons" text[] NOT NULL DEFAULT '{}',
  -- For a flagged scan: accepted (marked present) or rejected, by whom and why.
  "decision" text,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_qr_scans_outcome_ck" CHECK ("outcome" IN ('accepted', 'flagged', 'refused')),
  CONSTRAINT "attendance_qr_scans_decision_ck" CHECK ("decision" IS NULL OR "decision" IN ('accepted', 'rejected'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_qr_scans_slot_idx" ON "attendance_qr_scans" ("tenant_id", "timetable_slot_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_qr_scans_review_idx" ON "attendance_qr_scans" ("tenant_id", "date") WHERE "outcome" = 'flagged' AND "decision" IS NULL;--> statement-breakpoint
-- One accepted or waiting scan per student and period; refused attempts are kept for the log.
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_qr_scans_once_uq" ON "attendance_qr_scans" ("student_id", "timetable_slot_id", "date") WHERE "outcome" IN ('accepted', 'flagged');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_device_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "device_hash" text NOT NULL,
  "bound_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- Set when staff release the binding (a new phone); the next scan binds again.
  "released_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "released_at" timestamp with time zone,
  "release_reason" text
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_device_bindings_active_uq" ON "attendance_device_bindings" ("student_id") WHERE "released_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_device_bindings_device_idx" ON "attendance_device_bindings" ("tenant_id", "device_hash") WHERE "released_at" IS NULL;--> statement-breakpoint
-- Which channels a shortage alert went out on (the apps; SMS and WhatsApp when the office turns them on).
ALTER TABLE "attendance_alerts" ADD COLUMN IF NOT EXISTS "channels" text[] NOT NULL DEFAULT '{app}';--> statement-breakpoint
-- Device taps that belong to a period (a reader in the period's room): read by the mark sheet for confirmation.
CREATE INDEX IF NOT EXISTS "device_events_period_idx" ON "device_events" ("tenant_id", "subject_id", "event_at") WHERE "outcome" = 'period_tap';--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_qr_scans', 'attendance_device_bindings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
