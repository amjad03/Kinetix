-- Assets and facilities depth: an asset's department, supplier and order; transfers; condemnation and write-off;
-- bookable rooms and halls with facility bookings; maintenance tickets with a response deadline by priority.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "inv_vendors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "po_id" uuid REFERENCES "inv_purchase_orders"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "invoice_no" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "make" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "model" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "bookable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "facilities" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "rooms" SET "bookable" = true WHERE "kind" = 'hall';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "from_location" text DEFAULT '' NOT NULL,
  "to_location" text DEFAULT '' NOT NULL,
  "from_room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "to_room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "from_department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "to_department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "transferred_on" date NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_transfers_asset_idx" ON "asset_transfers" ("asset_id", "transferred_on");--> statement-breakpoint
ALTER TABLE "asset_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "asset_transfers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "asset_transfers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "asset_transfers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_condemnations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "condition" text DEFAULT '' NOT NULL,
  "proposed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "committee_note" text,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "disposal_mode" text,
  "realised_paise" bigint,
  "written_off_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_condemnations_number_uq" ON "asset_condemnations" ("tenant_id", "number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_condemnations_open_uq" ON "asset_condemnations" ("asset_id") WHERE status in ('proposed', 'approved');--> statement-breakpoint
ALTER TABLE "asset_condemnations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "asset_condemnations";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "asset_condemnations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "asset_condemnations" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facility_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "title" text NOT NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "organiser" text DEFAULT '' NOT NULL,
  "attendees" integer,
  "on_date" date NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "booked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "facility_bookings_time_ck" CHECK ("ends_at" > "starts_at")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "facility_bookings_number_uq" ON "facility_bookings" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_bookings_room_idx" ON "facility_bookings" ("room_id", "on_date");--> statement-breakpoint
ALTER TABLE "facility_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "facility_bookings";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "facility_bookings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "facility_bookings" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "category" text NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "asset_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL,
  "location" text DEFAULT '' NOT NULL,
  "raised_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assignee_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assignee_name" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "sla_hours" integer NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "responded_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "resolution" text,
  "cost_paise" bigint DEFAULT 0 NOT NULL,
  "rating" smallint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_tickets_number_uq" ON "maintenance_tickets" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tickets_status_idx" ON "maintenance_tickets" ("tenant_id", "status", "due_at");--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "maintenance_tickets";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "maintenance_tickets"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "maintenance_tickets" TO kinetix_app;
  END IF;
END $$;
