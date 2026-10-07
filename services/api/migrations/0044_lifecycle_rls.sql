-- Row-level security for the lifecycle tables (pattern from 0001_rls.sql). The lifecycle record is
-- append-only: the application role may read and add events but never change or delete them.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['promotion_batches', 'student_lifecycle_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
