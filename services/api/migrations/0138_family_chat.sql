-- Two-way family chat: office threads, open / closed / resolved status, muting, assignment, delivery ticks, attachments and class teachers.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'teacher';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS staff_muted boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS staff_delivered_at timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS family_delivered_at timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
DROP INDEX IF EXISTS conversations_trio_uq;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS conversations_trio_uq ON conversations (student_id, staff_id, family_id, kind);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conversations_family_idx ON conversations (family_id, last_message_at);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS attachment_key text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS attachment_name text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS attachment_type text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS attachment_size integer;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS class_teacher_id uuid REFERENCES users(id) ON DELETE SET NULL;
