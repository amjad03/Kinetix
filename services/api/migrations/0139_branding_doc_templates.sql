-- Institution branding (palette, fonts, logos, seal, signatures) and document templates for the layout engine.
CREATE TABLE IF NOT EXISTS "institution_branding" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "palette" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "fonts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "signatories" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tagline" text,
  "gstin" text,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doc_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "doc_type" text NOT NULL,
  "name" text NOT NULL,
  "based_on" text,
  "style" text,
  "layout" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "archived_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_templates_type_idx" ON "doc_templates" ("tenant_id", "doc_type");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doc_template_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "template_id" uuid NOT NULL REFERENCES "doc_templates"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "name" text NOT NULL,
  "layout" jsonb NOT NULL,
  "note" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_template_versions_uq" ON "doc_template_versions" ("template_id", "version");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doc_template_defaults" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "doc_type" text NOT NULL,
  "template_ref" text NOT NULL,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_template_defaults_uq" ON "doc_template_defaults" ("tenant_id", "doc_type");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['institution_branding', 'doc_templates', 'doc_template_versions', 'doc_template_defaults'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
