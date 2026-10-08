CREATE TABLE "grievance_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"ticket_no" text NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"committee" text,
	"committee_stage" text,
	"raised_by" uuid NOT NULL REFERENCES "users"("id"),
	"student_id" uuid REFERENCES "students"("id") ON DELETE set null,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"sla_due_at" timestamp with time zone NOT NULL,
	"escalation_level" smallint DEFAULT 0 NOT NULL,
	"escalated_at" timestamp with time zone,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"rating" smallint,
	"rating_comment" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grievance_tickets_category_ck" CHECK (category IN ('academic', 'exam', 'fees', 'hostel', 'transport', 'infrastructure', 'staff_conduct', 'ragging', 'harassment', 'other')),
	CONSTRAINT "grievance_tickets_severity_ck" CHECK (severity IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "grievance_tickets_status_ck" CHECK (status IN ('open', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed', 'reopened')),
	CONSTRAINT "grievance_tickets_committee_ck" CHECK (committee IS NULL OR committee IN ('anti_ragging', 'icc', 'posh')),
	CONSTRAINT "grievance_tickets_rating_ck" CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "grievance_tickets_no_uq" ON "grievance_tickets" USING btree ("tenant_id", "ticket_no");--> statement-breakpoint
CREATE INDEX "grievance_tickets_status_idx" ON "grievance_tickets" USING btree ("tenant_id", "status", "sla_due_at");--> statement-breakpoint
CREATE INDEX "grievance_tickets_raised_idx" ON "grievance_tickets" USING btree ("raised_by");--> statement-breakpoint
CREATE TABLE "grievance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"ticket_id" uuid NOT NULL REFERENCES "grievance_tickets"("id") ON DELETE cascade,
	"actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"actor_role" text NOT NULL,
	"kind" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grievance_events_visibility_ck" CHECK (visibility IN ('public', 'internal'))
);
--> statement-breakpoint
CREATE INDEX "grievance_events_ticket_idx" ON "grievance_events" USING btree ("ticket_id", "created_at");--> statement-breakpoint
CREATE TABLE "discipline_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"incident_on" date NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"description" text NOT NULL,
	"reported_by" uuid NOT NULL REFERENCES "users"("id"),
	"grievance_id" uuid REFERENCES "grievance_tickets"("id") ON DELETE set null,
	"status" text DEFAULT 'reported' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discipline_incidents_severity_ck" CHECK (severity IN ('minor', 'major', 'severe')),
	CONSTRAINT "discipline_incidents_status_ck" CHECK (status IN ('reported', 'under_review', 'action_taken', 'appealed', 'closed'))
);
--> statement-breakpoint
CREATE INDEX "discipline_incidents_student_idx" ON "discipline_incidents" USING btree ("student_id");--> statement-breakpoint
CREATE TABLE "discipline_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"incident_id" uuid NOT NULL REFERENCES "discipline_incidents"("id") ON DELETE cascade,
	"action" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"fine_paise" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"decided_by" uuid NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discipline_actions_action_ck" CHECK (action IN ('warning', 'fine', 'community_service', 'counselling_referral', 'suspension', 'expulsion')),
	CONSTRAINT "discipline_actions_status_ck" CHECK (status IN ('active', 'revoked', 'reduced'))
);
--> statement-breakpoint
CREATE TABLE "discipline_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"incident_id" uuid NOT NULL REFERENCES "discipline_incidents"("id") ON DELETE cascade,
	"action_id" uuid NOT NULL REFERENCES "discipline_actions"("id") ON DELETE cascade,
	"appellant_user_id" uuid NOT NULL REFERENCES "users"("id"),
	"grounds" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"decided_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discipline_appeals_status_ck" CHECK (status IN ('pending', 'upheld', 'reduced', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_appeals_pending_uq" ON "discipline_appeals" USING btree ("action_id") WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE "counselling_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"counsellor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"requested_by" uuid NOT NULL REFERENCES "users"("id"),
	"reason" text DEFAULT '' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" text DEFAULT 'requested' NOT NULL,
	"confidential_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counselling_sessions_status_ck" CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled', 'no_show'))
);
--> statement-breakpoint
CREATE INDEX "counselling_sessions_student_idx" ON "counselling_sessions" USING btree ("student_id");--> statement-breakpoint
CREATE TABLE "welfare_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id"),
	"requested_by" uuid NOT NULL REFERENCES "users"("id"),
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"amount_requested_paise" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"amount_approved_paise" bigint,
	"decision_note" text,
	"decided_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"decided_at" timestamp with time zone,
	"disbursed_on" date,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_requests_kind_ck" CHECK (kind IN ('scholarship', 'fee_waiver', 'medical_aid', 'hardship', 'other')),
	CONSTRAINT "welfare_requests_status_ck" CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'withdrawn'))
);
