-- Existing students start their lifecycle record at the time of this migration: one event noting
-- the status they already have, so every student has a timeline from day one. The owner connection
-- used by migrations is not subject to row-level security.

UPDATE students SET status_changed_at = coalesce(status_changed_at, now()) WHERE status_changed_at IS NULL;
--> statement-breakpoint
INSERT INTO student_lifecycle_events (tenant_id, student_id, kind, from_status, to_status, to_section_id, reason, effective_on)
SELECT s.tenant_id, s.id, 'status', NULL, s.status, s.section_id, 'Existing record', current_date
FROM students s
WHERE NOT EXISTS (SELECT 1 FROM student_lifecycle_events e WHERE e.student_id = s.id);
