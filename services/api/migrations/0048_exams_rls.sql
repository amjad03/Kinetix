-- Row-level security for schemes, exams and results (pattern from 0001_rls.sql).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grade_scales', 'assessment_schemes', 'scheme_components', 'exam_sessions', 'exam_papers', 'exam_seats', 'hall_tickets', 'exam_results', 'exam_result_lines', 'revaluation_requests'] LOOP
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
END $$;
