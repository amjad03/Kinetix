-- Evaluation ink in colour (pen colour and width per stroke group) and richer past-exam questions (unit, question number, paper code).
ALTER TABLE "eval_annotations" ADD COLUMN IF NOT EXISTS "color" text;--> statement-breakpoint
ALTER TABLE "eval_annotations" ADD COLUMN IF NOT EXISTS "width" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD COLUMN IF NOT EXISTS "unit" text;--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD COLUMN IF NOT EXISTS "question_no" text;--> statement-breakpoint
ALTER TABLE "past_exam_questions" ADD COLUMN IF NOT EXISTS "paper_code" text;
