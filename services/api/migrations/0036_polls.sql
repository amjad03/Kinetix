CREATE TYPE "public"."poll_answer_source" AS ENUM('app', 'card');--> statement-breakpoint
CREATE TYPE "public"."poll_kind" AS ENUM('mcq', 'numeric');--> statement-breakpoint
ALTER TYPE "public"."participation_outcome" ADD VALUE 'answered';--> statement-breakpoint
CREATE TABLE "answer_cards" (
	"tenant_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"card_no" smallint NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_cards_section_id_card_no_pk" PRIMARY KEY("section_id","card_no")
);
--> statement-breakpoint
CREATE TABLE "poll_responses" (
	"tenant_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"source" "poll_answer_source" NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "poll_responses_poll_id_student_id_pk" PRIMARY KEY("poll_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"board_session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid,
	"teacher_id" uuid NOT NULL,
	"kind" "poll_kind" NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct" text,
	"topic_code" text,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "participation_events" ADD COLUMN "poll_id" uuid;--> statement-breakpoint
ALTER TABLE "answer_cards" ADD CONSTRAINT "answer_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_cards" ADD CONSTRAINT "answer_cards_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_cards" ADD CONSTRAINT "answer_cards_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_board_session_id_board_sessions_id_fk" FOREIGN KEY ("board_session_id") REFERENCES "public"."board_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_cards_student_uq" ON "answer_cards" USING btree ("section_id","student_id");--> statement-breakpoint
CREATE INDEX "polls_session_idx" ON "polls" USING btree ("board_session_id");--> statement-breakpoint
CREATE INDEX "polls_section_idx" ON "polls" USING btree ("section_id","opened_at");--> statement-breakpoint
ALTER TABLE "participation_events" ADD CONSTRAINT "participation_events_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE set null ON UPDATE no action;