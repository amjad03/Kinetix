ALTER TABLE "devices" ADD COLUMN "health" jsonb;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "health_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "kiosk_override" boolean;--> statement-breakpoint
CREATE TABLE "device_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_by" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	CONSTRAINT "device_actions_status_ck" CHECK (status IN ('queued', 'sent', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "device_actions" ADD CONSTRAINT "device_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_actions" ADD CONSTRAINT "device_actions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_actions" ADD CONSTRAINT "device_actions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_actions_device_idx" ON "device_actions" USING btree ("device_id","created_at");--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE device_actions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON device_actions;
  CREATE POLICY tenant_isolation ON device_actions
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON device_actions TO kinetix_app;
  END IF;
END $$;
