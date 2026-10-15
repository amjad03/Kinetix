-- OBE completeness audit: question difficulty and the IQAC's verification of improvement actions.

-- A question's difficulty (easy, medium, hard; the question bank's scale) next to its Bloom level.
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE assessment_questions DROP CONSTRAINT IF EXISTS assessment_questions_difficulty_chk;
ALTER TABLE assessment_questions ADD CONSTRAINT assessment_questions_difficulty_chk CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard'));

-- The action-taken report is closed by a verification (IQAC or principal) after the action is done.
ALTER TABLE improvement_actions ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE improvement_actions ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE improvement_actions ADD COLUMN IF NOT EXISTS verify_note text;
