CREATE TABLE "content_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"rights_holder" text NOT NULL,
	"licence" text NOT NULL,
	"expires_on" date,
	"allowed_tenants" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_licenses_type_ck" CHECK (content_type IN ('course', 'topic', 'concept_video'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "content_licenses_content_uq" ON "content_licenses" USING btree ("content_type","content_id");--> statement-breakpoint
-- A global table written only by the platform team (owner role); institutions may read it.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT ON content_licenses TO kinetix_app;
  END IF;
END $$;
