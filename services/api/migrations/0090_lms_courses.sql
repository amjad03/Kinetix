CREATE TABLE "lms_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"section_id" uuid NOT NULL REFERENCES "sections"("id"),
	"subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lms_courses_status_ck" CHECK (status IN ('draft', 'published')),
	CONSTRAINT "lms_courses_offering_uq" UNIQUE ("section_id", "subject_id")
);
--> statement-breakpoint
CREATE TABLE "lms_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"course_id" uuid NOT NULL REFERENCES "lms_courses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"module_id" uuid NOT NULL REFERENCES "lms_modules"("id") ON DELETE cascade,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"ref_id" uuid,
	"url" text,
	CONSTRAINT "lms_items_kind_ck" CHECK (kind IN ('topic', 'video', 'homework', 'assessment', 'file', 'link'))
);
--> statement-breakpoint
CREATE TABLE "lms_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"course_id" uuid NOT NULL REFERENCES "lms_courses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_grade_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"course_id" uuid NOT NULL REFERENCES "lms_courses"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"weight" numeric(5,2) NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "lms_cat_source_ck" CHECK (source IN ('homework', 'test', 'assignment', 'internal', 'exam', 'practical')),
	CONSTRAINT "lms_cat_weight_ck" CHECK (weight > 0 AND weight <= 100)
);
--> statement-breakpoint
CREATE TABLE "lms_grade_overrides" (
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"category_id" uuid NOT NULL REFERENCES "lms_grade_categories"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"percent" numeric(5,2) NOT NULL,
	"reason" text NOT NULL,
	"set_by" uuid NOT NULL REFERENCES "users"("id"),
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("category_id", "student_id"),
	CONSTRAINT "lms_override_pct_ck" CHECK (percent >= 0 AND percent <= 100)
);
--> statement-breakpoint
CREATE INDEX "lms_modules_course_idx" ON "lms_modules" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "lms_items_module_idx" ON "lms_items" USING btree ("module_id","position");--> statement-breakpoint
CREATE INDEX "lms_ann_course_idx" ON "lms_announcements" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE INDEX "lms_cat_course_idx" ON "lms_grade_categories" USING btree ("course_id","position");
--> statement-breakpoint
ALTER TABLE "lms_courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lms_courses";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lms_courses"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lms_courses" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lms_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lms_modules";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lms_modules"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lms_modules" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lms_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lms_items";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lms_items"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lms_items" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lms_announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lms_announcements";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lms_announcements"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lms_announcements" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lms_grade_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lms_grade_categories";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lms_grade_categories"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lms_grade_categories" TO kinetix_app;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lms_grade_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "lms_grade_overrides";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lms_grade_overrides"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "lms_grade_overrides" TO kinetix_app;
  END IF;
END $$;
