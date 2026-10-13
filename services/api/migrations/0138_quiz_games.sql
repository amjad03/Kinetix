-- Live Quiz: the game-show quiz run on the board, kept per class with every answer and the final leaderboard.
CREATE TABLE IF NOT EXISTS "quiz_games" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "board_session_id" uuid NOT NULL REFERENCES "board_sessions"("id"),
  "section_id" uuid NOT NULL REFERENCES "sections"("id"),
  "subject_id" uuid REFERENCES "subjects"("id"),
  "teacher_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "questions" jsonb NOT NULL,
  "cards" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'lobby' NOT NULL,
  "current_index" integer DEFAULT -1 NOT NULL,
  "opened_at" timestamp with time zone,
  "closes_at" timestamp with time zone,
  "standings" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_games_section_idx" ON "quiz_games" ("section_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_games_session_idx" ON "quiz_games" ("board_session_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_game_answers" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "game_id" uuid NOT NULL REFERENCES "quiz_games"("id") ON DELETE CASCADE,
  "question_index" integer NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id"),
  "choice" integer NOT NULL,
  "source" "poll_answer_source" NOT NULL,
  "elapsed_ms" integer,
  "correct" boolean NOT NULL,
  "points" integer DEFAULT 0 NOT NULL,
  "answered_at" timestamp with time zone NOT NULL,
  CONSTRAINT "quiz_game_answers_game_id_question_index_student_id_pk" PRIMARY KEY ("game_id", "question_index", "student_id")
);--> statement-breakpoint
ALTER TABLE "quiz_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quiz_game_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "quiz_games";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "quiz_games"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "quiz_game_answers";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "quiz_game_answers"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "quiz_games", "quiz_game_answers" TO kinetix_app;
  END IF;
END $$;
