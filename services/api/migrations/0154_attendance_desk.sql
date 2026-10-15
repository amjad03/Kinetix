-- Attendance desk: leave and on-duty with approval that writes the marks, attendance at special classes, forenoon and
-- afternoon session marks, shortage alerts sent, and the condonation fee.
ALTER TABLE "attendance_condonations" ADD COLUMN IF NOT EXISTS "fee_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_condonations" ADD COLUMN IF NOT EXISTS "fee_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_condonations" ADD COLUMN IF NOT EXISTS "fee_receipt" text;--> statement-breakpoint
ALTER TABLE "attendance_condonations" ADD COLUMN IF NOT EXISTS "fee_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_condonations" ADD COLUMN IF NOT EXISTS "leave_ids" uuid[];--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_leaves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "from_time" time,
  "to_time" time,
  "reason" text NOT NULL,
  "activity" text DEFAULT '' NOT NULL,
  "document_key" text,
  "document_type" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "counts_as" "attendance_status",
  "applied_marks" integer DEFAULT 0 NOT NULL,
  "applied" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_leaves_student_idx" ON "attendance_leaves" ("student_id", "from_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_leaves_status_idx" ON "attendance_leaves" ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "special_class_attendance" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "special_class_id" uuid NOT NULL REFERENCES "special_classes"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "status" "attendance_status" NOT NULL,
  "marked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "marked_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("special_class_id", "student_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_session_marks" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "session" text NOT NULL,
  "status" "attendance_status" NOT NULL,
  "marked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "marked_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("student_id", "date", "session")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_session_marks_section_idx" ON "attendance_session_marks" ("section_id", "date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "scope" text NOT NULL,
  "level" smallint NOT NULL,
  "percent" numeric(5, 1) NOT NULL,
  "recipients" integer DEFAULT 0 NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_alerts_once_uq" ON "attendance_alerts" ("student_id", "kind", "scope", "level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_alerts_sent_idx" ON "attendance_alerts" ("tenant_id", "sent_at");--> statement-breakpoint
ALTER TABLE "attendance_leaves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "attendance_leaves";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attendance_leaves"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "special_class_attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "special_class_attendance";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "special_class_attendance"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "attendance_session_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "attendance_session_marks";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attendance_session_marks"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "attendance_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "attendance_alerts";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attendance_alerts"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_leaves", "special_class_attendance", "attendance_session_marks", "attendance_alerts" TO zynetix_app;
  END IF;
END $$;
