CREATE TABLE "student_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_leave_status_ck" CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "student_leave_dates_ck" CHECK (to_date >= from_date)
);
--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_leave_student_idx" ON "student_leave_requests" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "student_leave_status_idx" ON "student_leave_requests" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "student_leave_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "student_leave_requests";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_leave_requests"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "student_leave_requests" TO kinetix_app;
  END IF;
END $$;
