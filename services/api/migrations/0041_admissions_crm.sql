CREATE TYPE "public"."admission_cycle_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."application_fee_status" AS ENUM('none', 'pending', 'paid', 'waived');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('submitted', 'under_review', 'eligible', 'ineligible', 'waitlisted', 'offered', 'accepted', 'declined', 'rejected', 'enrolled', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."application_document_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."enquiry_activity_kind" AS ENUM('call', 'visit', 'email', 'sms', 'whatsapp', 'note');--> statement-breakpoint
CREATE TYPE "public"."enquiry_source" AS ENUM('web', 'walk_in', 'phone', 'campaign', 'referral', 'import');--> statement-breakpoint
CREATE TYPE "public"."enquiry_stage" AS ENUM('new', 'contacted', 'counselling', 'applied', 'converted', 'lost', 'deferred');--> statement-breakpoint
CREATE TABLE "admission_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "admission_cycle_status" DEFAULT 'draft' NOT NULL,
	"entry_term" smallint DEFAULT 1 NOT NULL,
	"seats" integer NOT NULL,
	"opens_on" date NOT NULL,
	"closes_on" date NOT NULL,
	"application_fee_paise" bigint DEFAULT 0 NOT NULL,
	"offer_valid_days" smallint DEFAULT 7 NOT NULL,
	"form_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"merit_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"doc_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" "application_document_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" NOT NULL,
	"provider" text,
	"provider_order_id" text,
	"provider_payment_id" text,
	"reference" text,
	"receipt_no" text,
	"recorded_by" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"application_no" text NOT NULL,
	"enquiry_id" uuid,
	"applicant_name" text NOT NULL,
	"date_of_birth" date,
	"gender" text,
	"phone" text NOT NULL,
	"email" text,
	"guardian_name" text NOT NULL,
	"guardian_phone" text NOT NULL,
	"guardian_email" text,
	"guardian_relation" text DEFAULT 'parent' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "application_status" DEFAULT 'submitted' NOT NULL,
	"status_reason" text,
	"fee_status" "application_fee_status" DEFAULT 'none' NOT NULL,
	"merit_score" numeric(10, 3),
	"merit_rank" integer,
	"eligibility_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_token_hash" text NOT NULL,
	"offer_expires_on" date,
	"student_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"program_id" uuid,
	"source" "enquiry_source" DEFAULT 'web' NOT NULL,
	"stage" "enquiry_stage" DEFAULT 'new' NOT NULL,
	"counsellor_id" uuid,
	"message" text,
	"lost_reason" text,
	"next_follow_up_on" date,
	"application_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"kind" "enquiry_activity_kind" NOT NULL,
	"note" text NOT NULL,
	"next_follow_up_on" date,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merit_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"seats" integer NOT NULL,
	"entries" jsonb NOT NULL,
	"generated_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_payments" ADD CONSTRAINT "application_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_payments" ADD CONSTRAINT "application_payments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_payments" ADD CONSTRAINT "application_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_counsellor_id_users_id_fk" FOREIGN KEY ("counsellor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_activities" ADD CONSTRAINT "enquiry_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_activities" ADD CONSTRAINT "enquiry_activities_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_activities" ADD CONSTRAINT "enquiry_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_lists" ADD CONSTRAINT "merit_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_lists" ADD CONSTRAINT "merit_lists_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_lists" ADD CONSTRAINT "merit_lists_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admission_cycles_program_idx" ON "admission_cycles" USING btree ("tenant_id","program_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "application_documents_uq" ON "application_documents" USING btree ("application_id","doc_key");--> statement-breakpoint
CREATE UNIQUE INDEX "application_payments_order_uq" ON "application_payments" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "application_payments_app_idx" ON "application_payments" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_no_uq" ON "applications" USING btree ("tenant_id","application_no");--> statement-breakpoint
CREATE INDEX "applications_cycle_idx" ON "applications" USING btree ("cycle_id","status");--> statement-breakpoint
CREATE INDEX "applications_phone_idx" ON "applications" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "enquiries_stage_idx" ON "enquiries" USING btree ("tenant_id","stage","created_at");--> statement-breakpoint
CREATE INDEX "enquiries_phone_idx" ON "enquiries" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "enquiries_counsellor_idx" ON "enquiries" USING btree ("counsellor_id");--> statement-breakpoint
CREATE INDEX "enquiry_activities_enquiry_idx" ON "enquiry_activities" USING btree ("enquiry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merit_lists_version_uq" ON "merit_lists" USING btree ("cycle_id","version");