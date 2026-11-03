-- Admissions pass: the admission document checklist and provisional admission, app credentials issued at enrolment,
-- campaign broadcasts to lead segments with opt-outs, and the application fee through the multi-gateway adapter.
CREATE TABLE IF NOT EXISTS "admission_checklist_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "item_key" text NOT NULL,
  "label" text NOT NULL,
  "required" boolean NOT NULL DEFAULT true,
  "original" boolean NOT NULL DEFAULT false,
  "why" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "due_on" date,
  "reference_no" text,
  "note" text,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_checklist_items_uq" ON "admission_checklist_items" ("application_id", "item_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_checklist_items_due_idx" ON "admission_checklist_items" ("tenant_id", "status", "due_on");--> statement-breakpoint

-- Provisional admission: admitted on an undertaking, confirmed when the checklist is complete.
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "provisional" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "provisional_until" date;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "admission_confirmed_at" timestamp with time zone;--> statement-breakpoint

-- Sign-in details sent to a new student and their parent (the address is kept masked).
CREATE TABLE IF NOT EXISTS "admission_credential_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "channel" text NOT NULL,
  "destination" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "issued_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_credential_issues_student_idx" ON "admission_credential_issues" ("student_id", "created_at");--> statement-breakpoint

-- A broadcast to a lead segment and each message of it.
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "opted_out_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_broadcasts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "admission_campaigns"("id") ON DELETE SET NULL,
  "template_id" uuid NOT NULL REFERENCES "message_templates"("id"),
  "channel" text NOT NULL,
  "segment" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued',
  "total" integer NOT NULL DEFAULT 0,
  "sent" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "idempotency_key" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_broadcasts_idem_uq" ON "admission_broadcasts" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_broadcast_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "broadcast_id" uuid NOT NULL REFERENCES "admission_broadcasts"("id") ON DELETE CASCADE,
  "enquiry_id" uuid NOT NULL REFERENCES "enquiries"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'queued',
  "reason" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_broadcast_sends_uq" ON "admission_broadcast_sends" ("broadcast_id", "enquiry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_broadcast_sends_status_idx" ON "admission_broadcast_sends" ("broadcast_id", "status");--> statement-breakpoint

-- The application fee through the gateway account of a fee account (any of the five gateways), polled like fees.
ALTER TABLE "application_payments" ADD COLUMN IF NOT EXISTS "gateway_account_id" uuid;--> statement-breakpoint
ALTER TABLE "application_payments" ADD COLUMN IF NOT EXISTS "checkout" jsonb;--> statement-breakpoint
ALTER TABLE "application_payments" ADD COLUMN IF NOT EXISTS "status_checks" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "application_payments" ADD COLUMN IF NOT EXISTS "status_checked_at" timestamp with time zone;--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admission_checklist_items', 'admission_credential_issues', 'admission_broadcasts', 'admission_broadcast_sends'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
