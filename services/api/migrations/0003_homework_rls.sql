-- Row-level security for the homework table (same tenant_isolation pattern as 0001_rls.sql).
-- Every new tenant table needs a migration like this one; test/rls.e2e.spec.ts enforces it.

ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON homework;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON homework
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON homework TO kinetix_app;
  END IF;
END $$;
