-- Transport production pass (2/2): boarding and alighting by RFID, the bus pass QR or the conductor (tied to the trip
-- and stop, once per trip and student), the trip sheet (vehicle and odometer), and the ledger of fee changes made
-- after a month was billed (moves and cancellations, charged or credited).
ALTER TABLE "transport_boardings" ADD COLUMN IF NOT EXISTS "trip_id" uuid REFERENCES "transport_trips"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transport_boardings" ADD COLUMN IF NOT EXISTS "stop_id" uuid REFERENCES "transport_stops"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transport_boardings" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'board';--> statement-breakpoint
ALTER TABLE "transport_boardings" ADD COLUMN IF NOT EXISTS "method" text NOT NULL DEFAULT 'rfid';--> statement-breakpoint
ALTER TABLE "transport_boardings" ADD COLUMN IF NOT EXISTS "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transport_boardings_trip_uq" ON "transport_boardings" ("trip_id", "student_id", "kind") WHERE "trip_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_boardings_day_idx" ON "transport_boardings" ("tenant_id", "on_date");--> statement-breakpoint
ALTER TABLE "transport_trips" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid REFERENCES "transport_vehicles"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD COLUMN IF NOT EXISTS "start_odometer_km" integer;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD COLUMN IF NOT EXISTS "end_odometer_km" integer;--> statement-breakpoint
-- Older seeded trips used other words for the same states.
UPDATE "transport_trips" SET "status" = 'ended' WHERE "status" = 'completed';--> statement-breakpoint
UPDATE "transport_trip_events" SET "kind" = 'stop_reached' WHERE "kind" = 'arrived';--> statement-breakpoint
UPDATE "transport_trips" t SET "vehicle_id" = r."vehicle_id" FROM "transport_routes" r WHERE r."id" = t."route_id" AND t."vehicle_id" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_fee_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "transport_assignments"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "month" text NOT NULL,
  "amount_paise" bigint NOT NULL,
  "applied_paise" bigint NOT NULL DEFAULT 0,
  "refund_due_paise" bigint NOT NULL DEFAULT 0,
  "invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "note" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_fee_adjustments_student_idx" ON "transport_fee_adjustments" ("student_id", "month");--> statement-breakpoint
ALTER TABLE "transport_fee_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "transport_fee_adjustments";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transport_fee_adjustments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_fee_adjustments" TO zynetix_app;
  END IF;
END $$;
