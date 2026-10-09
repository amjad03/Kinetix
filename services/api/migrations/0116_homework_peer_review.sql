-- Homework peer review: anonymous classmate reviews with a rubric and a comment.
CREATE TABLE IF NOT EXISTS "homework_peer_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "homework_id" uuid NOT NULL REFERENCES "homework"("id") ON DELETE CASCADE,
  "author_student_id" uuid NOT NULL REFERENCES "students"("id"),
  "reviewer_student_id" uuid NOT NULL REFERENCES "students"("id"),
  "rubric" jsonb,
  "comment" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_peer_reviews_uq" ON "homework_peer_reviews" ("homework_id", "author_student_id", "reviewer_student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_peer_reviews_reviewer_idx" ON "homework_peer_reviews" ("homework_id", "reviewer_student_id");--> statement-breakpoint
ALTER TABLE "homework_peer_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "homework_peer_reviews";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "homework_peer_reviews"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "homework_peer_reviews" TO kinetix_app;
  END IF;
END $$;
