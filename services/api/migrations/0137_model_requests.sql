-- 3D model requests: models teachers ask for from the board's 3D library, kept per school for the content team.
CREATE TABLE IF NOT EXISTS "model_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campus_id" uuid REFERENCES "campuses"("id"),
  "device_id" uuid REFERENCES "devices"("id"),
  "teacher_id" uuid REFERENCES "users"("id"),
  "name" text NOT NULL,
  "subject" text,
  "class_level" text,
  "note" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_requests_tenant_idx" ON "model_requests" ("tenant_id", "created_at");--> statement-breakpoint
ALTER TABLE "model_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "model_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "model_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "model_requests" TO kinetix_app;
  END IF;
END $$;
