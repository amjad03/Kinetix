-- Fee reminder steps and escalations, and the Tally retry queue (fees pass, owner requirements 3 and 4).
--
-- fee_reminder_sends: one row per invoice, schedule step and channel, so a step (7 days before, on the due date,
-- 15 days after with the class teacher copied…) goes out once, and the escalation report shows who was told when.
CREATE TABLE IF NOT EXISTS "fee_reminder_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "step" text NOT NULL,
  "channel" text NOT NULL,
  "audience" text NOT NULL DEFAULT 'family',
  "sent_on" date NOT NULL,
  "balance_paise" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_reminder_sends_uq" ON "fee_reminder_sends" ("invoice_id", "step", "channel", "audience");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_reminder_sends_day_idx" ON "fee_reminder_sends" ("tenant_id", "sent_on");--> statement-breakpoint

-- Tally: failed pushes are tried again on their own with a growing wait; each fee account can post to its own Tally company.
ALTER TABLE "tally_sync_log" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tally_sync_log" ADD COLUMN IF NOT EXISTS "company" text;--> statement-breakpoint
ALTER TABLE "fee_accounts" ADD COLUMN IF NOT EXISTS "tally_company" text;--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_reminder_sends'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
