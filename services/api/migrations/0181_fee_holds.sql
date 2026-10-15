-- Fee holds: when the institution turns them on (fee settings, dues block), overdue fees hold back a student's hall
-- ticket, the result shown to the student and family, and the transfer certificate. The principal can let one
-- through for a student; each such override is kept here and audited.
CREATE TABLE IF NOT EXISTS "fee_hold_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL,
  "reason" text NOT NULL,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_hold_overrides_student_idx" ON "fee_hold_overrides" ("student_id", "purpose");--> statement-breakpoint
ALTER TABLE "fee_hold_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "fee_hold_overrides";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fee_hold_overrides"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_hold_overrides" TO zynetix_app;
  END IF;
END $$;
