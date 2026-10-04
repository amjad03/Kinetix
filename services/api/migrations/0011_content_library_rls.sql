-- Content library access.
-- curricula and courses are global and read-only for the application role.
-- chapters and topics: global rows (tenant_id null) are readable by everyone; an institution
-- reads its own rows too, and may only write rows carrying its own tenant_id.

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT ON curricula, courses TO kinetix_app;
  END IF;

  FOREACH t IN ARRAY ARRAY['chapters', 'topics'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS global_read ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format('CREATE POLICY global_read ON %I FOR SELECT USING (tenant_id IS NULL)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
