-- Academics follow-up audit (OBE-2): internal choice on question papers ("answer any 5 of 7"). Questions sharing a
-- choice group are answered any `attempt_any` of; only the best answered ones count towards the total and towards CO
-- attainment, so a question the student chose to skip no longer counts as 0 against its CO.
ALTER TABLE "assessment_questions" ADD COLUMN IF NOT EXISTS "choice_group" text;
--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD COLUMN IF NOT EXISTS "attempt_any" smallint;
--> statement-breakpoint
ALTER TABLE "assessment_questions" DROP CONSTRAINT IF EXISTS "assessment_questions_choice_ck";
--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_choice_ck" CHECK (("choice_group" IS NULL) = ("attempt_any" IS NULL) AND ("attempt_any" IS NULL OR "attempt_any" >= 1));
