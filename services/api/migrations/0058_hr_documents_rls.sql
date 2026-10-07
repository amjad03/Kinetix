-- Row-level security for HR, payroll and documents (pattern from 0001_rls.sql).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['designations', 'staff_profiles', 'staff_attendance', 'leave_types', 'leave_balances', 'leave_requests', 'job_openings', 'job_applicants', 'salary_components', 'salary_structures', 'salary_structure_lines', 'payroll_settings', 'payroll_runs', 'payslips', 'certificate_templates', 'certificate_counters', 'certificates', 'vault_documents'] LOOP
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
