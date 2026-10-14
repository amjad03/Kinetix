-- Hostel depth: hostels above blocks (gender and year rules), room types with fees, applications ranked by rules,
-- bed holds (reservation, internship), room-change and vacate requests, caution deposits and vacate settlements
-- (pro-rata refund net of damages), wardens and the duty roster, the sick bay, late entries with escalation,
-- discipline incidents with fines, room assets, mess billing per day with leave rebates, and parent approval of passes.
CREATE TABLE IF NOT EXISTS "hostels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "code" text NOT NULL DEFAULT '',
  "gender" text NOT NULL DEFAULT 'mixed',
  "address" text NOT NULL DEFAULT '',
  "warden_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "phone" text NOT NULL DEFAULT '',
  "allowed_terms" smallint[] NOT NULL DEFAULT '{}',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostels_name_uq" ON "hostels" ("tenant_id", lower("name"));--> statement-breakpoint
ALTER TABLE "hostel_blocks"
  ADD COLUMN IF NOT EXISTS "hostel_id" uuid REFERENCES "hostels"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "allowed_terms" smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;--> statement-breakpoint
INSERT INTO "hostels" ("tenant_id", "name", "gender")
SELECT DISTINCT b.tenant_id, 'Main hostel', 'mixed' FROM "hostel_blocks" b
WHERE b.hostel_id IS NULL AND NOT EXISTS (SELECT 1 FROM "hostels" h WHERE h.tenant_id = b.tenant_id);--> statement-breakpoint
UPDATE "hostel_blocks" b SET "hostel_id" = (SELECT h.id FROM "hostels" h WHERE h.tenant_id = b.tenant_id ORDER BY h.created_at LIMIT 1) WHERE b.hostel_id IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "hostel_blocks_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_blocks_name_uq" ON "hostel_blocks" ("tenant_id", "hostel_id", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_room_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "beds_per_room" smallint NOT NULL DEFAULT 2,
  "ac" boolean NOT NULL DEFAULT false,
  "attached_bath" boolean NOT NULL DEFAULT false,
  "fee_paise" bigint NOT NULL DEFAULT 0,
  "description" text NOT NULL DEFAULT '',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_room_types_name_uq" ON "hostel_room_types" ("tenant_id", lower("name"));--> statement-breakpoint
ALTER TABLE "hostel_rooms"
  ADD COLUMN IF NOT EXISTS "room_type_id" uuid REFERENCES "hostel_room_types"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS "note" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "hostel_allotments"
  ADD COLUMN IF NOT EXISTS "vacate_reason" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hostel_gate_passes"
  ADD COLUMN IF NOT EXISTS "parent_status" text,
  ADD COLUMN IF NOT EXISTS "parent_decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "parent_decided_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "hostel_id" uuid REFERENCES "hostels"("id") ON DELETE SET NULL,
  "room_type_id" uuid REFERENCES "hostel_room_types"("id") ON DELETE SET NULL,
  "gender" text NOT NULL DEFAULT '',
  "distance_km" numeric(7, 1),
  "merit_score" numeric(6, 2),
  "category" text NOT NULL DEFAULT 'general',
  "needs" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'applied',
  "priority" numeric(8, 2) NOT NULL DEFAULT 0,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text NOT NULL DEFAULT '',
  "allotment_id" uuid REFERENCES "hostel_allotments"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_applications_open_uq" ON "hostel_applications" ("student_id") WHERE "status" IN ('applied', 'approved', 'waitlisted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_bed_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "bed_id" uuid NOT NULL REFERENCES "hostel_beds"("id") ON DELETE CASCADE,
  "student_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "reason" text NOT NULL DEFAULT 'reservation',
  "from_on" date NOT NULL,
  "until_on" date NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "note" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_bed_holds_active_uq" ON "hostel_bed_holds" ("bed_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "room_type_id" uuid REFERENCES "hostel_room_types"("id") ON DELETE SET NULL,
  "bed_id" uuid REFERENCES "hostel_beds"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "effective_on" date NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_deposits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "allotment_id" uuid REFERENCES "hostel_allotments"("id") ON DELETE SET NULL,
  "amount_paise" bigint NOT NULL,
  "collected_on" date NOT NULL,
  "mode" text NOT NULL DEFAULT 'cash',
  "receipt_no" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'held',
  "damages_paise" bigint NOT NULL DEFAULT 0,
  "refunded_paise" bigint NOT NULL DEFAULT 0,
  "refunded_on" date,
  "note" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "allotment_id" uuid NOT NULL REFERENCES "hostel_allotments"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "vacated_on" date NOT NULL,
  "monthly_fee_paise" bigint NOT NULL DEFAULT 0,
  "days_used" integer NOT NULL DEFAULT 0,
  "days_in_month" integer NOT NULL DEFAULT 30,
  "prorata_refund_paise" bigint NOT NULL DEFAULT 0,
  "deposit_paise" bigint NOT NULL DEFAULT 0,
  "damages_paise" bigint NOT NULL DEFAULT 0,
  "dues_paise" bigint NOT NULL DEFAULT 0,
  "net_refund_paise" bigint NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "paid_on" date,
  "reference" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_staff" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "hostel_id" uuid NOT NULL REFERENCES "hostels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'warden',
  "from_on" date NOT NULL,
  "until_on" date,
  "phone" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_duties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "hostel_id" uuid NOT NULL REFERENCES "hostels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "duty_on" date NOT NULL,
  "shift" text NOT NULL DEFAULT 'night',
  "status" text NOT NULL DEFAULT 'scheduled',
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_duties_uq" ON "hostel_duties" ("user_id", "duty_on", "shift");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_sickbay" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "health_visit_id" uuid REFERENCES "health_visits"("id") ON DELETE SET NULL,
  "admitted_at" timestamp with time zone NOT NULL,
  "discharged_at" timestamp with time zone,
  "symptoms" text NOT NULL,
  "treatment" text NOT NULL DEFAULT '',
  "referred_to" text NOT NULL DEFAULT '',
  "parent_alerted" boolean NOT NULL DEFAULT false,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_late_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "entered_at" timestamp with time zone NOT NULL,
  "minutes_late" integer NOT NULL DEFAULT 0,
  "reason" text NOT NULL DEFAULT '',
  "gate_pass_id" uuid REFERENCES "hostel_gate_passes"("id") ON DELETE SET NULL,
  "escalated" boolean NOT NULL DEFAULT false,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_late_entries_student_idx" ON "hostel_late_entries" ("student_id", "entered_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "occurred_on" date NOT NULL,
  "kind" text NOT NULL DEFAULT 'misconduct',
  "description" text NOT NULL,
  "action_taken" text NOT NULL DEFAULT '',
  "fine_paise" bigint NOT NULL DEFAULT 0,
  "fine_charged_title" text,
  "status" text NOT NULL DEFAULT 'open',
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_room_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "room_id" uuid NOT NULL REFERENCES "hostel_rooms"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "asset_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL,
  "inv_item_id" uuid REFERENCES "inv_items"("id") ON DELETE SET NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "condition" text NOT NULL DEFAULT 'good',
  "checked_on" date,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "mess_plans"
  ADD COLUMN IF NOT EXISTS "billing" text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS "per_day_paise" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rebate_min_days" smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "rebate_per_day_paise" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mess_leaves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "from_on" date NOT NULL,
  "to_on" date NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mess_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "plan_id" uuid REFERENCES "mess_plans"("id") ON DELETE SET NULL,
  "month" text NOT NULL,
  "days" integer NOT NULL,
  "leave_days" integer NOT NULL DEFAULT 0,
  "rebate_days" integer NOT NULL DEFAULT 0,
  "gross_paise" bigint NOT NULL,
  "rebate_paise" bigint NOT NULL DEFAULT 0,
  "net_paise" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "charged_title" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mess_bills_uq" ON "mess_bills" ("student_id", "month");--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['hostels', 'hostel_room_types', 'hostel_applications', 'hostel_bed_holds', 'hostel_requests', 'hostel_deposits', 'hostel_settlements', 'hostel_staff', 'hostel_duties', 'hostel_sickbay', 'hostel_late_entries', 'hostel_incidents', 'hostel_room_assets', 'mess_leaves', 'mess_bills'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
