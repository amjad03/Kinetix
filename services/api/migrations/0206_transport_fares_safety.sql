-- Transport production pass (1/2): distance-based fare slabs and each stop's distance from the campus, the driver's
-- verification record (gender, date of birth, licence class and since when, police verification reference, medical
-- fitness, training), the conductor and woman attendant on each route, and the school-bus safety checklist per vehicle.
CREATE TABLE IF NOT EXISTS "transport_fare_slabs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "from_km" numeric(7, 2) NOT NULL,
  "to_km" numeric(7, 2) NOT NULL,
  "monthly_fee_paise" bigint NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transport_fare_slabs_from_uq" ON "transport_fare_slabs" ("tenant_id", "from_km");--> statement-breakpoint
ALTER TABLE "transport_stops" ADD COLUMN IF NOT EXISTS "distance_km" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "gender" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "licence_class" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "licence_issued_on" date;--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "police_verification_ref" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "medical_valid_until" date;--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "trained_on" date;--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD COLUMN IF NOT EXISTS "verification_note" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "conductor_id" uuid REFERENCES "transport_drivers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "attendant_id" uuid REFERENCES "transport_drivers"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_safety_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "transport_vehicles"("id") ON DELETE CASCADE,
  "checked_on" date NOT NULL,
  "items" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "passed" boolean NOT NULL DEFAULT false,
  "next_due_on" date,
  "note" text NOT NULL DEFAULT '',
  "checked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_safety_checks_vehicle_idx" ON "transport_safety_checks" ("vehicle_id", "checked_on");--> statement-breakpoint
ALTER TABLE "transport_fare_slabs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "transport_fare_slabs";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transport_fare_slabs"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_fare_slabs" TO zynetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "transport_safety_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "transport_safety_checks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transport_safety_checks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_safety_checks" TO zynetix_app;
  END IF;
END $$;
