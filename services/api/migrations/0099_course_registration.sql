-- Course registration engine (CBCS/CBE): offerings per term, registration windows, student registrations.
CREATE TABLE IF NOT EXISTS "course_offerings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "term_id" uuid NOT NULL REFERENCES "academic_terms"("id"),
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id"),
  "category" text NOT NULL,
  "credits" numeric(4,1) NOT NULL,
  "seat_cap" integer NOT NULL,
  "faculty_id" uuid REFERENCES "users"("id"),
  "slot_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "eligible_program_ids" uuid[],
  "eligible_semesters" integer[],
  "prerequisite_subject_id" uuid REFERENCES "subjects"("id"),
  "status" text DEFAULT 'open' NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "course_offerings_category_ck" CHECK (category IN ('core', 'elective', 'open_elective', 'skill', 'ability')),
  CONSTRAINT "course_offerings_status_ck" CHECK (status IN ('open', 'closed')),
  CONSTRAINT "course_offerings_seats_ck" CHECK (seat_cap >= 0 AND credits >= 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_offerings_term_subject_uq" ON "course_offerings" ("term_id", "subject_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registration_windows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "term_id" uuid NOT NULL REFERENCES "academic_terms"("id"),
  "program_id" uuid REFERENCES "programs"("id"),
  "opens_at" timestamp with time zone NOT NULL,
  "closes_at" timestamp with time zone NOT NULL,
  "add_drop_until" timestamp with time zone NOT NULL,
  "min_credits" numeric(5,1) DEFAULT 0 NOT NULL,
  "max_credits" numeric(5,1) NOT NULL,
  "allocation_rule" text DEFAULT 'cgpa' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "registration_windows_rule_ck" CHECK (allocation_rule IN ('cgpa', 'time')),
  CONSTRAINT "registration_windows_credits_ck" CHECK (min_credits <= max_credits)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registration_windows_program_uq" ON "registration_windows" ("term_id", "program_id") WHERE program_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registration_windows_all_uq" ON "registration_windows" ("term_id") WHERE program_id IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "offering_id" uuid NOT NULL REFERENCES "course_offerings"("id"),
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "term_id" uuid NOT NULL REFERENCES "academic_terms"("id"),
  "status" text NOT NULL,
  "preference_rank" integer,
  "waitlist_pos" integer,
  "auto_core" boolean DEFAULT false NOT NULL,
  "approval" text DEFAULT 'pending' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "course_registrations_status_ck" CHECK (status IN ('preference', 'registered', 'waitlisted', 'not_allotted', 'dropped')),
  CONSTRAINT "course_registrations_approval_ck" CHECK (approval IN ('pending', 'approved', 'rejected'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_registrations_once_uq" ON "course_registrations" ("offering_id", "student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_registrations_student_idx" ON "course_registrations" ("student_id", "term_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['course_offerings', 'registration_windows', 'course_registrations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
