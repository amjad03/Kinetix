-- Question bank and question paper engine.
CREATE TABLE IF NOT EXISTS "qb_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "unit" text,
  "topic" text NOT NULL,
  "co_id" uuid REFERENCES "course_outcomes"("id") ON DELETE SET NULL,
  "bloom" text NOT NULL,
  "difficulty" text NOT NULL,
  "marks" integer NOT NULL,
  "type" text NOT NULL,
  "text" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answer" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_questions_subject_idx" ON "qb_questions" ("subject_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_questions_trgm_idx" ON "qb_questions" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qb_question_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "qb_questions"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "edited_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qb_question_versions_uq" ON "qb_question_versions" ("question_id", "version");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qb_blueprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "title" text NOT NULL,
  "total_marks" integer NOT NULL,
  "duration_minutes" integer NOT NULL,
  "sections" jsonb NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qb_papers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "blueprint_id" uuid NOT NULL REFERENCES "qb_blueprints"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "title" text NOT NULL,
  "seed" text NOT NULL,
  "avoid_last" integer DEFAULT 3 NOT NULL,
  "repeats" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "setter_id" uuid NOT NULL REFERENCES "users"("id"),
  "moderator_id" uuid REFERENCES "users"("id"),
  "remarks" text,
  "decided_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "locked_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_papers_subject_idx" ON "qb_papers" ("subject_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qb_paper_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "qb_papers"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "qb_questions"("id"),
  "section" smallint NOT NULL,
  "position" smallint NOT NULL,
  "marks" integer NOT NULL,
  "snapshot" jsonb NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_paper_items_paper_idx" ON "qb_paper_items" ("paper_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_paper_items_question_idx" ON "qb_paper_items" ("question_id");--> statement-breakpoint
ALTER TABLE "qb_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "qb_questions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "qb_questions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "qb_questions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "qb_question_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "qb_question_versions";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "qb_question_versions"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "qb_question_versions" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "qb_blueprints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "qb_blueprints";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "qb_blueprints"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "qb_blueprints" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "qb_papers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "qb_papers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "qb_papers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "qb_papers" TO kinetix_app;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "qb_paper_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "qb_paper_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "qb_paper_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "qb_paper_items" TO kinetix_app;
  END IF;
END $$;
