-- Skill mapping, student outcome passport, SDG and impact mapping.
CREATE TABLE IF NOT EXISTS "skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT 'skill' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skills_code_uq" ON "skills" ("tenant_id", "code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_maps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "ref" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_maps_uq" ON "skill_maps" ("skill_id", "kind", "ref");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "level" smallint NOT NULL,
  "title" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome_passports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "verify_token" text NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_passports_student_uq" ON "outcome_passports" ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_passports_token_uq" ON "outcome_passports" ("verify_token");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sdg_goals" (
  "number" smallint PRIMARY KEY NOT NULL,
  "name" text NOT NULL
);--> statement-breakpoint
INSERT INTO "sdg_goals" ("number", "name") VALUES
  (1, 'No Poverty'), (2, 'Zero Hunger'), (3, 'Good Health and Well-being'), (4, 'Quality Education'),
  (5, 'Gender Equality'), (6, 'Clean Water and Sanitation'), (7, 'Affordable and Clean Energy'),
  (8, 'Decent Work and Economic Growth'), (9, 'Industry, Innovation and Infrastructure'), (10, 'Reduced Inequalities'),
  (11, 'Sustainable Cities and Communities'), (12, 'Responsible Consumption and Production'), (13, 'Climate Action'),
  (14, 'Life Below Water'), (15, 'Life on Land'), (16, 'Peace, Justice and Strong Institutions'), (17, 'Partnerships for the Goals')
ON CONFLICT ("number") DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT ON "sdg_goals" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sdg_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sdg_number" smallint NOT NULL REFERENCES "sdg_goals"("number"),
  "item_type" text NOT NULL,
  "item_id" uuid NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "tagged_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sdg_tags_uq" ON "sdg_tags" ("sdg_number", "item_type", "item_id");--> statement-breakpoint
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "skills";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "skills"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "skills" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "skill_maps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "skill_maps";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "skill_maps"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "skill_maps" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "skill_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "skill_evidence";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "skill_evidence"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "skill_evidence" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "outcome_passports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "outcome_passports";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "outcome_passports"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "outcome_passports" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "sdg_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "sdg_tags";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sdg_tags"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "sdg_tags" TO kinetix_app;
  END IF;
END $$;
