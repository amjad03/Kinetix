-- Guest cast codes belong to one institution: row-level security like every tenant table.
-- Lookups by code (before the guest's institution is known) use the system connection.
ALTER TABLE "cast_join_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "cast_join_codes";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "cast_join_codes"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
