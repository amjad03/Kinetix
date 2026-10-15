-- Question paper setting for an exam session: appointed setters and moderators, sets of a paper, and the draw.
-- qp_appointments: the controller appoints a setter (and a moderator) for a subject of a session, with the number of
-- sets, a due date and the remuneration; the appointee accepts or declines. qb_papers.session_id / set_label: a paper
-- built from the question bank as set A, B, C ... of that session's subject. qp_set_draws: the set picked (at random)
-- from the locked sets for the examination; only that set is released before the exam.
CREATE TABLE IF NOT EXISTS "qp_appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sets_required" smallint NOT NULL DEFAULT 2,
  "due_on" date NOT NULL,
  "status" text NOT NULL DEFAULT 'appointed',
  "remuneration_paise" bigint NOT NULL DEFAULT 0,
  "note" text,
  "responded_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "qp_appointments_role_ck" CHECK ("role" IN ('setter', 'moderator')),
  CONSTRAINT "qp_appointments_status_ck" CHECK ("status" IN ('appointed', 'accepted', 'declined', 'submitted', 'completed', 'cancelled'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qp_appointments_session_idx" ON "qp_appointments" ("session_id", "subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qp_appointments_user_idx" ON "qp_appointments" ("user_id", "status");--> statement-breakpoint
ALTER TABLE "qb_papers" ADD COLUMN IF NOT EXISTS "session_id" uuid REFERENCES "exam_sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "qb_papers" ADD COLUMN IF NOT EXISTS "set_label" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qb_papers_set_uq" ON "qb_papers" ("session_id", "subject_id", "set_label") WHERE "session_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qp_set_draws" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "paper_id" uuid NOT NULL REFERENCES "qb_papers"("id") ON DELETE CASCADE,
  "candidates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "drawn_by" uuid NOT NULL REFERENCES "users"("id"),
  "drawn_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qp_set_draws_uq" ON "qp_set_draws" ("session_id", "subject_id");--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qp_appointments', 'qp_set_draws'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
