CREATE TABLE "hostel_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"block_id" uuid REFERENCES "hostel_blocks"("id"),
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"requested_by" uuid NOT NULL REFERENCES "users"("id"),
	"allotted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_waitlist_status_ck" CHECK (status IN ('waiting', 'allotted', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_waitlist_open_uq" ON "hostel_waitlist" USING btree ("student_id") WHERE status = 'waiting';--> statement-breakpoint
CREATE TABLE "hostel_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"from_bed_id" uuid NOT NULL REFERENCES "hostel_beds"("id"),
	"to_bed_id" uuid NOT NULL REFERENCES "hostel_beds"("id"),
	"reason" text NOT NULL,
	"moved_on" date NOT NULL,
	"moved_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_night_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"night" date NOT NULL,
	"status" text NOT NULL,
	"marked_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_night_status_ck" CHECK (status IN ('present', 'absent', 'leave'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_night_uq" ON "hostel_night_attendance" USING btree ("student_id","night");--> statement-breakpoint
CREATE TABLE "transport_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vehicle_id" uuid NOT NULL REFERENCES "transport_vehicles"("id"),
	"kind" text NOT NULL,
	"spent_on" date NOT NULL,
	"amount_paise" bigint NOT NULL CHECK (amount_paise > 0),
	"litres" numeric(8,2),
	"odometer_km" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_expense_kind_ck" CHECK (kind IN ('fuel', 'repair', 'toll', 'other'))
);
--> statement-breakpoint
CREATE INDEX "transport_expenses_vehicle_idx" ON "transport_expenses" USING btree ("vehicle_id","spent_on");--> statement-breakpoint
CREATE TABLE "transport_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vehicle_id" uuid REFERENCES "transport_vehicles"("id"),
	"trip_id" uuid REFERENCES "transport_trips"("id"),
	"kind" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"reported_by" uuid NOT NULL REFERENCES "users"("id"),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_incident_ck" CHECK (kind IN ('accident', 'breakdown', 'delay', 'behaviour', 'other') AND severity IN ('low', 'medium', 'high') AND status IN ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "transport_gps_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "transport_gps_token_uq" ON "transport_gps_sources" USING btree ("token_hash");--> statement-breakpoint
CREATE TABLE "canteen_meal_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"meal_date" date NOT NULL,
	"meal" text NOT NULL,
	"marked_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_meal_ck" CHECK (meal IN ('breakfast', 'lunch', 'snacks', 'dinner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_meal_uq" ON "canteen_meal_attendance" USING btree ("student_id","meal_date","meal");--> statement-breakpoint
CREATE TABLE "canteen_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"amount_paise" bigint NOT NULL CHECK (amount_paise > 0),
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"payer_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_topup_status_ck" CHECK (status IN ('created', 'paid'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_topup_order_uq" ON "canteen_topups" USING btree ("provider_order_id");
--> statement-breakpoint
ALTER TABLE "hostel_waitlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "hostel_waitlist";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "hostel_waitlist"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "hostel_waitlist" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "hostel_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "hostel_transfers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "hostel_transfers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "hostel_transfers" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "hostel_night_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "hostel_night_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "hostel_night_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "hostel_night_attendance" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "transport_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "transport_expenses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transport_expenses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_expenses" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "transport_incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "transport_incidents";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transport_incidents"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_incidents" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "transport_gps_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "transport_gps_sources";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transport_gps_sources"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_gps_sources" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "canteen_meal_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "canteen_meal_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "canteen_meal_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "canteen_meal_attendance" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "canteen_topups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "canteen_topups";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "canteen_topups"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "canteen_topups" TO kinetix_app;
  END IF;
END $$;
