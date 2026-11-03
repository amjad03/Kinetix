-- Indexes found by the load test on a 20,000-student institution (docs/operations/PERFORMANCE.md). Each one replaces a
-- sequential scan of a large table on a busy screen. On a big existing database, build them first by hand with
-- CREATE INDEX CONCURRENTLY (same names) so this migration finds them and does nothing.

-- Day, week and range counts over attendance (attendance desk day and dashboard, analytics KPIs, attendance week,
-- shortage lists): by date, answered from the index alone.
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_date_idx" ON "attendance_records" ("tenant_id", "date") INCLUDE ("status", "student_id", "timetable_slot_id");--> statement-breakpoint
-- Period attendance: "was this period marked on this day" (timetable of a class for a day, marking progress).
CREATE INDEX IF NOT EXISTS "attendance_records_slot_date_idx" ON "attendance_records" ("timetable_slot_id", "date") WHERE "timetable_slot_id" IS NOT NULL;--> statement-breakpoint
-- One student's marks (Parent and Student apps, marks ledger, report cards).
CREATE INDEX IF NOT EXISTS "marks_student_idx" ON "marks" ("student_id");--> statement-breakpoint
-- One student's payments (fee page of the Parent App and the ERP student fee card).
CREATE INDEX IF NOT EXISTS "fee_payments_student_idx" ON "fee_payments" ("student_id", "paid_at");--> statement-breakpoint
-- The student behind a student login (every Student App request checks it).
CREATE INDEX IF NOT EXISTS "students_user_idx" ON "students" ("user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
-- One student's results across exam sessions.
CREATE INDEX IF NOT EXISTS "exam_results_student_idx" ON "exam_results" ("student_id");
