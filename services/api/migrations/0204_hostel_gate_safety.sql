-- Hostel pass (1 of 2): room amenities, wardens limited to their blocks, the QR gate log, medical emergencies in the
-- sick bay, the hostel's committees (anti-ragging committee and squad, mess committee) and mess committee inspections.
ALTER TABLE "hostel_rooms" ADD COLUMN IF NOT EXISTS "amenities" text[] NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "hostel_room_types" ADD COLUMN IF NOT EXISTS "amenities" text[] NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "hostel_staff" ADD COLUMN IF NOT EXISTS "block_ids" uuid[] NOT NULL DEFAULT '{}';--> statement-breakpoint
-- The resident's gate QR: a random token per stay, so it dies with the allotment.
ALTER TABLE "hostel_allotments" ADD COLUMN IF NOT EXISTS "gate_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_allotments_gate_token_uq" ON "hostel_allotments" ("gate_token") WHERE "gate_token" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "hostel_sickbay" ADD COLUMN IF NOT EXISTS "severity" text NOT NULL DEFAULT 'routine';--> statement-breakpoint
ALTER TABLE "hostel_sickbay" ADD COLUMN IF NOT EXISTS "escort" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "hostel_sickbay" ADD COLUMN IF NOT EXISTS "hospital_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hostel_sickbay" ADD COLUMN IF NOT EXISTS "outcome" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_gate_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "method" text NOT NULL DEFAULT 'qr',
  "gate_pass_id" uuid REFERENCES "hostel_gate_passes"("id") ON DELETE SET NULL,
  "late_entry_id" uuid REFERENCES "hostel_late_entries"("id") ON DELETE SET NULL,
  "minutes_late" integer NOT NULL DEFAULT 0,
  "gate" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_gate_logs_student_idx" ON "hostel_gate_logs" ("student_id", "at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_gate_logs_at_idx" ON "hostel_gate_logs" ("tenant_id", "at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_committees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "committee_id" uuid NOT NULL REFERENCES "committees"("id") ON DELETE CASCADE,
  "hostel_id" uuid REFERENCES "hostels"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL,
  "constituted_on" date NOT NULL,
  "valid_until" date,
  "helpline" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_committees_uq" ON "hostel_committees" ("committee_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mess_inspections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "hostel_id" uuid REFERENCES "hostels"("id") ON DELETE SET NULL,
  "inspected_on" date NOT NULL,
  "meal" text NOT NULL,
  "quality" smallint NOT NULL,
  "quantity" smallint NOT NULL,
  "hygiene" smallint NOT NULL,
  "remarks" text NOT NULL DEFAULT '',
  "action_taken" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "inspector_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mess_inspections_on_idx" ON "mess_inspections" ("tenant_id", "inspected_on");--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['hostel_gate_logs', 'hostel_committees', 'mess_inspections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
