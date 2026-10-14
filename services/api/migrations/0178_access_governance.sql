-- Governance: the institution's role access rules (a staff role may only look at, or loses, a module) and campus details.
CREATE TABLE IF NOT EXISTS "role_access_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "module" text NOT NULL,
  "access" text NOT NULL CHECK ("access" IN ('read', 'none')),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_access_rules_uq" ON "role_access_rules" ("tenant_id", "role", "module");--> statement-breakpoint
ALTER TABLE "role_access_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "role_access_rules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "role_access_rules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "role_access_rules" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "code" text;--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "head_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campuses_code_uq" ON "campuses" ("tenant_id", lower("code")) WHERE "code" IS NOT NULL;--> statement-breakpoint
-- Existing campuses start in name order.
UPDATE "campuses" c SET "sort_order" = o.n FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY lower(name)) * 10 AS n FROM "campuses") o WHERE o.id = c.id;
