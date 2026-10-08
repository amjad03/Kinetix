-- Row-level security for MFA, sessions, feature flags, the event outbox, scans, reports, placement and research (pattern from 0061_campus_ops_rls.sql).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_mfa', 'user_sessions', 'tenant_security_policies', 'feature_flags', 'domain_events', 'upload_scans', 'report_schedules', 'report_runs', 'placement_records', 'research_outputs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
  -- Consumption marks have no tenant column; they follow the visibility of their event.
  ALTER TABLE event_consumptions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS consumer_rows ON event_consumptions;
  CREATE POLICY consumer_rows ON event_consumptions
    USING (EXISTS (SELECT 1 FROM domain_events e WHERE e.id = event_id))
    WITH CHECK (EXISTS (SELECT 1 FROM domain_events e WHERE e.id = event_id));
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT ON event_consumptions TO kinetix_app;
  END IF;
END $$;
