CREATE TABLE IF NOT EXISTS "ai_connections" (
  "tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "provider" text DEFAULT 'anthropic' NOT NULL,
  "api_key_enc" text NOT NULL,
  "api_key_last4" text NOT NULL,
  "model" text DEFAULT 'claude-sonnet-5-5' NOT NULL,
  "fallback_model" text DEFAULT 'claude-haiku-5-5',
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "ai_connections";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ai_connections"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_connections" TO kinetix_app;
  END IF;
END $$;
