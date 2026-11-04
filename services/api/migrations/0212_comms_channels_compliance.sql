-- Communication pass: channel providers and DLT registration, credits, per-channel consent, a log of every send with
-- its cost and delivery report, provider webhooks (idempotent), fallback chains and emergency campaigns.
CREATE TABLE IF NOT EXISTS "comm_channel_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'console',
  "enabled" boolean NOT NULL DEFAULT true,
  "sender_id" text NOT NULL DEFAULT '',
  "dlt_entity_id" text NOT NULL DEFAULT '',
  "unit_cost_paise" integer NOT NULL DEFAULT 0,
  "hourly_limit" integer NOT NULL DEFAULT 0,
  "daily_limit" integer NOT NULL DEFAULT 0,
  "low_balance_units" integer NOT NULL DEFAULT 0,
  "webhook_token" text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_channel_settings_uq" ON "comm_channel_settings" ("tenant_id", "channel");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_credit_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "kind" text NOT NULL,
  "units" integer NOT NULL,
  "amount_paise" bigint NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "reference" text NOT NULL DEFAULT '',
  "send_id" uuid,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_credit_ledger_channel_idx" ON "comm_credit_ledger" ("tenant_id", "channel", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_channel_prefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "granted" boolean NOT NULL,
  "source" text NOT NULL DEFAULT 'app',
  "notice_version" text NOT NULL DEFAULT '',
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_channel_prefs_user_idx" ON "comm_channel_prefs" ("user_id", "channel", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_send_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "delivery_id" uuid REFERENCES "message_deliveries"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "provider" text NOT NULL DEFAULT '',
  "address" text NOT NULL DEFAULT '',
  "status" text NOT NULL,
  "provider_message_id" text,
  "units" integer NOT NULL DEFAULT 0,
  "cost_paise" integer NOT NULL DEFAULT 0,
  "error" text,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "sent_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "emergency" boolean NOT NULL DEFAULT false,
  "step" smallint NOT NULL DEFAULT 0,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_send_log_time_idx" ON "comm_send_log" ("tenant_id", "attempted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_send_log_source_idx" ON "comm_send_log" ("source_type", "source_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_send_log_provider_uq" ON "comm_send_log" ("provider", "provider_message_id") WHERE "provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "event_key" text NOT NULL,
  "kind" text NOT NULL DEFAULT '',
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_webhook_events_uq" ON "comm_webhook_events" ("tenant_id", "provider", "event_key");--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "dlt_header" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "dlt_content_type" text NOT NULL DEFAULT 'service_implicit';--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "wa_template_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "wa_language" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "message_campaigns" ALTER COLUMN "audience_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "fallback" text[] NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "emergency" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "announcement_id" uuid REFERENCES "announcements"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "delivered_count" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "cost_paise" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD COLUMN IF NOT EXISTS "step" smallint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD COLUMN IF NOT EXISTS "cost_paise" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD COLUMN IF NOT EXISTS "deferred_reason" text;--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comm_channel_settings', 'comm_credit_ledger', 'comm_channel_prefs', 'comm_send_log', 'comm_webhook_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
