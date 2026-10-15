-- Campus-scoped roles: a member of staff whose every role is tied to a campus (user_roles.campus_id) sees and changes
-- only that campus's rows of the tables that carry a campus. The API puts the person's campuses in app.campus_ids
-- (DbService.withTenant, from the access guard); empty means every campus. The policies are RESTRICTIVE, so they
-- narrow the tenant isolation policy and never widen it. Rows with no campus (shared across campuses) stay visible.
-- Where it applies: docs/architecture/campus-scope.md.
CREATE OR REPLACE FUNCTION kx_campus_visible(c uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT c IS NULL
      OR coalesce(current_setting('app.campus_ids', true), '') = ''
      OR c = ANY (string_to_array(current_setting('app.campus_ids', true), ',')::uuid[])
  $$;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programs', 'buildings', 'rooms', 'fee_structures', 'campus_settings', 'devices'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS campus_scope ON %I', t);
    EXECUTE format('CREATE POLICY campus_scope ON %I AS RESTRICTIVE USING (kx_campus_visible(campus_id)) WITH CHECK (kx_campus_visible(campus_id))', t);
  END LOOP;
END $$;--> statement-breakpoint
DROP POLICY IF EXISTS campus_scope ON "campuses";--> statement-breakpoint
CREATE POLICY campus_scope ON "campuses" AS RESTRICTIVE USING (kx_campus_visible(id)) WITH CHECK (kx_campus_visible(id));--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT EXECUTE ON FUNCTION kx_campus_visible(uuid) TO zynetix_app;
  END IF;
END $$;
