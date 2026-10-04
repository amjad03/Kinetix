-- Row-level security for every tenant-owned table.
--
-- The application connects as kinetix_app, which is neither the table owner nor BYPASSRLS, so
-- these policies always apply to it. The owner role (migrations, narrowly scoped system lookups)
-- bypasses RLS as owners do by default.
--
-- If app.tenant_id is unset or empty the comparison is with NULL and no rows match: a missing
-- tenant context fails closed.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'campuses','users','user_roles','academic_years','programs','sections','subjects','students',
    'rooms','timetable_slots','devices','pairing_codes','board_sessions','attendance_records',
    'participation_events','sync_ops','broadcasts','broadcast_receipts','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self ON tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT USAGE ON SCHEMA public TO kinetix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kinetix_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kinetix_app;
    -- The app may read tenants but never create or alter them.
    REVOKE INSERT, UPDATE, DELETE ON tenants FROM kinetix_app;
    -- The audit log is append-only for the app.
    REVOKE UPDATE, DELETE ON audit_log FROM kinetix_app;
  END IF;
END $$;
