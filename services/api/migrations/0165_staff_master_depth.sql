-- Staff master depth: the personal, statutory and faculty-eligibility details of a staff record (cadre, category,
-- Aadhaar kept encrypted, Ph.D. and NET/SET status, pay scale), ordered designations with their cadre, richer
-- qualifications, and three new lists on the record: prior experience, publications and documents.
ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "staff_category" text DEFAULT 'teaching' NOT NULL,
  ADD COLUMN IF NOT EXISTS "cadre" text,
  ADD COLUMN IF NOT EXISTS "post_type" text DEFAULT 'sanctioned' NOT NULL,
  ADD COLUMN IF NOT EXISTS "social_category" text,
  ADD COLUMN IF NOT EXISTS "religion" text,
  ADD COLUMN IF NOT EXISTS "blood_group" text,
  ADD COLUMN IF NOT EXISTS "marital_status" text,
  ADD COLUMN IF NOT EXISTS "father_or_spouse_name" text,
  ADD COLUMN IF NOT EXISTS "differently_abled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "address" text,
  ADD COLUMN IF NOT EXISTS "emergency_contact_name" text,
  ADD COLUMN IF NOT EXISTS "emergency_contact_phone" text,
  ADD COLUMN IF NOT EXISTS "aadhaar_enc" text,
  ADD COLUMN IF NOT EXISTS "aadhaar_last4" text,
  ADD COLUMN IF NOT EXISTS "phd_status" text DEFAULT 'none' NOT NULL,
  ADD COLUMN IF NOT EXISTS "phd_year" smallint,
  ADD COLUMN IF NOT EXISTS "net_set" text DEFAULT 'none' NOT NULL,
  ADD COLUMN IF NOT EXISTS "net_set_year" smallint,
  ADD COLUMN IF NOT EXISTS "pay_scale" text,
  ADD COLUMN IF NOT EXISTS "pay_level" smallint,
  ADD COLUMN IF NOT EXISTS "confirmed_on" date,
  ADD COLUMN IF NOT EXISTS "retirement_age" smallint DEFAULT 60 NOT NULL,
  ADD COLUMN IF NOT EXISTS "lwf_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "designations"
  ADD COLUMN IF NOT EXISTS "cadre" text,
  ADD COLUMN IF NOT EXISTS "staff_category" text DEFAULT 'teaching' NOT NULL,
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "designations" d SET "sort_order" = s.n * 10 FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY name) AS n FROM "designations") s WHERE s.id = d.id;--> statement-breakpoint
ALTER TABLE "staff_qualifications"
  ADD COLUMN IF NOT EXISTS "specialisation" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "university" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "percentage" numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "division" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_experience" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organisation" text NOT NULL,
  "designation" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'teaching' NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "last_pay_paise" bigint,
  "reason_for_leaving" text DEFAULT '' NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_experience_user_idx" ON "staff_experience" ("user_id", "from_date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'journal' NOT NULL,
  "title" text NOT NULL,
  "authors" text DEFAULT '' NOT NULL,
  "venue" text DEFAULT '' NOT NULL,
  "year" smallint NOT NULL,
  "volume" text DEFAULT '' NOT NULL,
  "pages" text DEFAULT '' NOT NULL,
  "issn_isbn" text DEFAULT '' NOT NULL,
  "doi" text DEFAULT '' NOT NULL,
  "indexing" text DEFAULT 'none' NOT NULL,
  "impact_factor" numeric(7, 3),
  "author_role" text DEFAULT 'co_author' NOT NULL,
  "status" text DEFAULT 'published' NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_publications_user_idx" ON "staff_publications" ("user_id", "year");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'other' NOT NULL,
  "title" text NOT NULL,
  "number" text DEFAULT '' NOT NULL,
  "issued_on" date,
  "expires_on" date,
  "file_key" text,
  "file_type" text,
  "file_name" text,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_documents_user_idx" ON "staff_documents" ("user_id", "kind");--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['staff_experience', 'staff_publications', 'staff_documents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
