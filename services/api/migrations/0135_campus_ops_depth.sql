-- Admissions and campus operations depth: per-module settings (rules, templates, defaults, numbering series) and library stock verification.
CREATE TABLE IF NOT EXISTS "module_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "module" text NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "numbering" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "module_settings_uq" ON "module_settings" ("tenant_id", "module");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_stock_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "started_by" uuid REFERENCES "users"("id"),
  "closed_by" uuid REFERENCES "users"("id"),
  "closed_at" timestamp with time zone,
  "summary" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_stock_check_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "check_id" uuid NOT NULL REFERENCES "library_stock_checks"("id") ON DELETE CASCADE,
  "book_id" uuid NOT NULL REFERENCES "library_books"("id") ON DELETE CASCADE,
  "found" integer DEFAULT 1 NOT NULL,
  "scanned_by" uuid REFERENCES "users"("id"),
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_stock_check_items_uq" ON "library_stock_check_items" ("check_id", "book_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['module_settings', 'library_stock_checks', 'library_stock_check_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
