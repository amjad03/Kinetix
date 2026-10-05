ALTER TYPE "public"."ai_task" ADD VALUE 'transcribe';--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "audio_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "est_cost_inr" numeric(12, 4);