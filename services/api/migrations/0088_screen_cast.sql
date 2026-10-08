CREATE TABLE "cast_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"board_session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sender_name" text NOT NULL,
	"sender_role" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "cast_sessions_state_ck" CHECK (state IN ('pending', 'active', 'ended')),
	CONSTRAINT "cast_sessions_role_ck" CHECK (sender_role IN ('teacher', 'student'))
);
--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD CONSTRAINT "cast_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD CONSTRAINT "cast_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD CONSTRAINT "cast_sessions_board_session_id_board_sessions_id_fk" FOREIGN KEY ("board_session_id") REFERENCES "public"."board_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_sessions" ADD CONSTRAINT "cast_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cast_sessions_device_idx" ON "cast_sessions" USING btree ("device_id","state");--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE cast_sessions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON cast_sessions;
  CREATE POLICY tenant_isolation ON cast_sessions
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON cast_sessions TO kinetix_app;
  END IF;
END $$;
