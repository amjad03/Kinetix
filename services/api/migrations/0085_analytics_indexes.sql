CREATE INDEX IF NOT EXISTS "attendance_records_section_date_idx" ON "attendance_records" USING btree ("tenant_id","section_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payments_paid_idx" ON "fee_payments" USING btree ("tenant_id","paid_at") WHERE status = 'paid';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_sessions_started_idx" ON "board_sessions" USING btree ("tenant_id","started_at");
