CREATE TYPE "public"."lifecycle_event_kind" AS ENUM('status', 'promotion', 'section', 'guardian');--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE 'admissions_officer';--> statement-breakpoint
CREATE TABLE "promotion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "lifecycle_event_kind" NOT NULL,
	"from_status" text,
	"to_status" text,
	"from_section_id" uuid,
	"to_section_id" uuid,
	"reason" text,
	"effective_on" date NOT NULL,
	"batch_id" uuid,
	"data" jsonb,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "is_emergency_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "enrolled_on" date;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD CONSTRAINT "student_lifecycle_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD CONSTRAINT "student_lifecycle_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD CONSTRAINT "student_lifecycle_events_from_section_id_sections_id_fk" FOREIGN KEY ("from_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD CONSTRAINT "student_lifecycle_events_to_section_id_sections_id_fk" FOREIGN KEY ("to_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD CONSTRAINT "student_lifecycle_events_batch_id_promotion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."promotion_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lifecycle_events" ADD CONSTRAINT "student_lifecycle_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_lifecycle_events_student_idx" ON "student_lifecycle_events" USING btree ("student_id","created_at");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_one_primary_uq" ON "guardians" USING btree ("student_id") WHERE "guardians"."is_primary";