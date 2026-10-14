-- Transport depth: permit and road-tax expiry, spare drivers and police verification, stop-wise fees and timings
-- with a manual stop order, staff riders (charged through payroll), route change requests with the fee difference,
-- the maintenance schedule, temporary route changes (substitute vehicle, timing, cancellation) with family notices,
-- authorised pick-up persons and OTP or photo hand-overs, driver duty with substitutes, over-speed and
-- route-deviation alerts, and insurance claims on incidents.
ALTER TABLE "transport_vehicles"
  ADD COLUMN IF NOT EXISTS "permit_expires_on" date,
  ADD COLUMN IF NOT EXISTS "road_tax_expires_on" date,
  ADD COLUMN IF NOT EXISTS "fuel_type" text NOT NULL DEFAULT 'diesel',
  ADD COLUMN IF NOT EXISTS "ownership" text NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS "gps_device" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "transport_drivers"
  ADD COLUMN IF NOT EXISTS "is_spare" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "badge_no" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "police_verified_on" date;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "code" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "transport_stops"
  ADD COLUMN IF NOT EXISTS "fee_paise" bigint,
  ADD COLUMN IF NOT EXISTS "drop_time" text,
  ADD COLUMN IF NOT EXISTS "landmark" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE "transport_stops" SET "sort_order" = "seq" * 10 WHERE "sort_order" = 0;--> statement-breakpoint
ALTER TABLE "transport_assignments" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transport_assignments"
  ADD COLUMN IF NOT EXISTS "staff_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS "fee_paise" bigint;--> statement-breakpoint
ALTER TABLE "transport_assignments" DROP CONSTRAINT IF EXISTS "transport_assignments_rider_ck";--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_rider_ck" CHECK ("student_id" IS NOT NULL OR "staff_user_id" IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transport_assignments_staff_uq" ON "transport_assignments" ("staff_user_id") WHERE "ended_on" IS NULL AND "staff_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transport_trip_events"
  ADD COLUMN IF NOT EXISTS "lat" numeric(9, 6),
  ADD COLUMN IF NOT EXISTS "lng" numeric(9, 6),
  ADD COLUMN IF NOT EXISTS "speed_kmh" numeric(6, 1),
  ADD COLUMN IF NOT EXISTS "detail" text,
  ADD COLUMN IF NOT EXISTS "acknowledged_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_trip_events_kind_idx" ON "transport_trip_events" ("tenant_id", "kind", "at");--> statement-breakpoint
ALTER TABLE "transport_incidents"
  ADD COLUMN IF NOT EXISTS "insurer" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "claim_no" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "claim_amount_paise" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "claim_status" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "claim_filed_on" date,
  ADD COLUMN IF NOT EXISTS "settled_paise" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "injuries" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "police_report" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "from_route_id" uuid REFERENCES "transport_routes"("id") ON DELETE SET NULL,
  "from_stop_id" uuid REFERENCES "transport_stops"("id") ON DELETE SET NULL,
  "to_route_id" uuid NOT NULL REFERENCES "transport_routes"("id") ON DELETE CASCADE,
  "to_stop_id" uuid NOT NULL REFERENCES "transport_stops"("id") ON DELETE CASCADE,
  "effective_on" date NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "fee_delta_paise" bigint NOT NULL DEFAULT 0,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text NOT NULL DEFAULT '',
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_maintenance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "vehicle_id" uuid NOT NULL REFERENCES "transport_vehicles"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'service',
  "due_on" date,
  "due_km" integer,
  "done_on" date,
  "odometer_km" integer,
  "cost_paise" bigint NOT NULL DEFAULT 0,
  "vendor" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'scheduled',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_route_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "route_id" uuid NOT NULL REFERENCES "transport_routes"("id") ON DELETE CASCADE,
  "from_on" date NOT NULL,
  "until_on" date NOT NULL,
  "kind" text NOT NULL DEFAULT 'timing',
  "substitute_vehicle_id" uuid REFERENCES "transport_vehicles"("id") ON DELETE SET NULL,
  "substitute_driver_id" uuid REFERENCES "transport_drivers"("id") ON DELETE SET NULL,
  "shift_minutes" integer NOT NULL DEFAULT 0,
  "reason" text NOT NULL,
  "notified_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_pickup_persons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "relation" text NOT NULL DEFAULT '',
  "phone" text NOT NULL DEFAULT '',
  "id_proof" text NOT NULL DEFAULT '',
  "photo_url" text NOT NULL DEFAULT '',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_handovers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "trip_id" uuid REFERENCES "transport_trips"("id") ON DELETE SET NULL,
  "person_id" uuid REFERENCES "transport_pickup_persons"("id") ON DELETE SET NULL,
  "method" text NOT NULL DEFAULT 'otp',
  "otp_hash" text,
  "otp_expires_at" timestamp with time zone,
  "attempts" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "handed_at" timestamp with time zone,
  "note" text NOT NULL DEFAULT '',
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_driver_duty" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "driver_id" uuid NOT NULL REFERENCES "transport_drivers"("id") ON DELETE CASCADE,
  "duty_on" date NOT NULL,
  "route_id" uuid REFERENCES "transport_routes"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'present',
  "substitute_driver_id" uuid REFERENCES "transport_drivers"("id") ON DELETE SET NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transport_driver_duty_uq" ON "transport_driver_duty" ("driver_id", "duty_on");--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['transport_change_requests', 'transport_maintenance', 'transport_route_overrides', 'transport_pickup_persons', 'transport_handovers', 'transport_driver_duty'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
