-- OBE completeness audit: question difficulty and the IQAC's verification of improvement actions.

-- A question's difficulty (easy, medium, hard; the question bank's scale) next to its Bloom level.
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE assessment_questions DROP CONSTRAINT IF EXISTS assessment_questions_difficulty_chk;
ALTER TABLE assessment_questions ADD CONSTRAINT assessment_questions_difficulty_chk CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard'));

-- The action-taken report is closed by a verification (IQAC or principal) after the action is done.
ALTER TABLE improvement_actions ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE improvement_actions ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE improvement_actions ADD COLUMN IF NOT EXISTS verify_note text;

-- How strongly a PEO is served by each PO and PSO (1 low, 2 medium, 3 high), with the reason; PEO attainment follows.
CREATE TABLE IF NOT EXISTS "peo_po_map" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "peo_id" uuid NOT NULL REFERENCES "program_outcomes"("id") ON DELETE CASCADE,
  "outcome_id" uuid NOT NULL REFERENCES "program_outcomes"("id") ON DELETE CASCADE,
  "strength" smallint NOT NULL,
  "justification" text,
  CONSTRAINT "peo_po_map_pk" PRIMARY KEY ("peo_id", "outcome_id"),
  CONSTRAINT "peo_po_map_strength_ck" CHECK ("strength" BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS "peo_po_map_program_idx" ON "peo_po_map" ("program_id");

-- The course plan: which COs each unit (chapter) of the course's syllabus serves. Keyed by CO code so it survives a new CO version.
CREATE TABLE IF NOT EXISTS "obe_unit_cos" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "chapter_id" uuid NOT NULL REFERENCES "chapters"("id") ON DELETE CASCADE,
  "co_code" text NOT NULL,
  "set_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "obe_unit_cos_pk" PRIMARY KEY ("subject_id", "chapter_id", "co_code")
);

ALTER TABLE "peo_po_map" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "peo_po_map";
CREATE POLICY tenant_isolation ON "peo_po_map"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE "obe_unit_cos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "obe_unit_cos";
CREATE POLICY tenant_isolation ON "obe_unit_cos"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "peo_po_map", "obe_unit_cos" TO zynetix_app;
  END IF;
END $$;
