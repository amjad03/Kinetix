-- The register of issued documents: signed payload hash, serial, status (valid, revoked, superseded) and the QR token.
CREATE TABLE IF NOT EXISTS "issued_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "doc_type" text NOT NULL,
  "serial" text NOT NULL,
  "title" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid,
  "subject_name" text,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "key_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "payload" jsonb NOT NULL,
  "payload_hash" text NOT NULL,
  "signature" text NOT NULL,
  "key_id" text NOT NULL,
  "public_key_pem" text NOT NULL,
  "template_ref" text,
  "template_version" integer,
  "status" text DEFAULT 'valid' NOT NULL,
  "verify_token" text NOT NULL,
  "issued_by" uuid REFERENCES "users"("id"),
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id"),
  "revoked_reason" text,
  "superseded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issued_documents_serial_uq" ON "issued_documents" ("tenant_id", "serial");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issued_documents_token_uq" ON "issued_documents" ("verify_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_documents_source_idx" ON "issued_documents" ("tenant_id", "source_type", "source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_documents_type_idx" ON "issued_documents" ("tenant_id", "doc_type", "issued_at");--> statement-breakpoint
ALTER TABLE "issued_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "issued_documents";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "issued_documents"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "issued_documents" TO kinetix_app;
  END IF;
END $$;
