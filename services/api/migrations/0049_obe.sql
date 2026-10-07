CREATE TYPE "public"."action_status" AS ENUM('open', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."co_set_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."outcome_kind" AS ENUM('mission', 'vision', 'peo', 'po', 'pso');--> statement-breakpoint
CREATE TYPE "public"."survey_kind" AS ENUM('course_exit', 'graduate_exit', 'alumni', 'employer');--> statement-breakpoint
CREATE TABLE "assessment_co_map" (
	"tenant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"co_id" uuid NOT NULL,
	"share" numeric(4, 3) DEFAULT 1 NOT NULL,
	CONSTRAINT "assessment_co_map_assessment_id_co_id_pk" PRIMARY KEY("assessment_id","co_id")
);
--> statement-breakpoint
CREATE TABLE "attainment_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"target_id" uuid NOT NULL,
	"code" text NOT NULL,
	"subject_id" uuid,
	"direct" numeric(5, 2),
	"indirect" numeric(5, 2),
	"combined" numeric(5, 2),
	"target" numeric(5, 2) NOT NULL,
	"gap" numeric(5, 2),
	"met" boolean NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_by" uuid NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co_outcome_map" (
	"tenant_id" uuid NOT NULL,
	"co_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"strength" smallint NOT NULL,
	CONSTRAINT "co_outcome_map_co_id_outcome_id_pk" PRIMARY KEY("co_id","outcome_id")
);
--> statement-breakpoint
CREATE TABLE "co_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "co_set_status" DEFAULT 'draft' NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"co_set_id" uuid NOT NULL,
	"code" text NOT NULL,
	"statement" text NOT NULL,
	"bloom_level" text,
	"ord" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "improvement_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"target_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"owner_id" uuid,
	"due_on" date,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obe_configs" (
	"program_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obe_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"target_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"note" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obe_survey_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"co_id" uuid,
	"outcome_id" uuid,
	"rating" numeric(4, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obe_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"subject_id" uuid,
	"academic_year_id" uuid NOT NULL,
	"kind" "survey_kind" NOT NULL,
	"title" text NOT NULL,
	"scale_max" smallint DEFAULT 5 NOT NULL,
	"min_responses" smallint DEFAULT 5 NOT NULL,
	"weight" numeric(5, 2) DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"kind" "outcome_kind" NOT NULL,
	"code" text NOT NULL,
	"statement" text NOT NULL,
	"ord" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_co_map" ADD CONSTRAINT "assessment_co_map_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_co_map" ADD CONSTRAINT "assessment_co_map_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_co_map" ADD CONSTRAINT "assessment_co_map_co_id_course_outcomes_id_fk" FOREIGN KEY ("co_id") REFERENCES "public"."course_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attainment_snapshots" ADD CONSTRAINT "attainment_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attainment_snapshots" ADD CONSTRAINT "attainment_snapshots_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attainment_snapshots" ADD CONSTRAINT "attainment_snapshots_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attainment_snapshots" ADD CONSTRAINT "attainment_snapshots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attainment_snapshots" ADD CONSTRAINT "attainment_snapshots_computed_by_users_id_fk" FOREIGN KEY ("computed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_outcome_map" ADD CONSTRAINT "co_outcome_map_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_outcome_map" ADD CONSTRAINT "co_outcome_map_co_id_course_outcomes_id_fk" FOREIGN KEY ("co_id") REFERENCES "public"."course_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_outcome_map" ADD CONSTRAINT "co_outcome_map_outcome_id_program_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."program_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_sets" ADD CONSTRAINT "co_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_sets" ADD CONSTRAINT "co_sets_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_sets" ADD CONSTRAINT "co_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_outcomes" ADD CONSTRAINT "course_outcomes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_outcomes" ADD CONSTRAINT "course_outcomes_co_set_id_co_sets_id_fk" FOREIGN KEY ("co_set_id") REFERENCES "public"."co_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_configs" ADD CONSTRAINT "obe_configs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_configs" ADD CONSTRAINT "obe_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_configs" ADD CONSTRAINT "obe_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD CONSTRAINT "obe_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD CONSTRAINT "obe_evidence_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_evidence" ADD CONSTRAINT "obe_evidence_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_survey_ratings" ADD CONSTRAINT "obe_survey_ratings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_survey_ratings" ADD CONSTRAINT "obe_survey_ratings_survey_id_obe_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."obe_surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_survey_ratings" ADD CONSTRAINT "obe_survey_ratings_co_id_course_outcomes_id_fk" FOREIGN KEY ("co_id") REFERENCES "public"."course_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_survey_ratings" ADD CONSTRAINT "obe_survey_ratings_outcome_id_program_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."program_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_surveys" ADD CONSTRAINT "obe_surveys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_surveys" ADD CONSTRAINT "obe_surveys_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_surveys" ADD CONSTRAINT "obe_surveys_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_surveys" ADD CONSTRAINT "obe_surveys_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_surveys" ADD CONSTRAINT "obe_surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_outcomes" ADD CONSTRAINT "program_outcomes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_outcomes" ADD CONSTRAINT "program_outcomes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attainment_snapshots_idx" ON "attainment_snapshots" USING btree ("program_id","academic_year_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "co_sets_version_uq" ON "co_sets" USING btree ("subject_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "course_outcomes_code_uq" ON "course_outcomes" USING btree ("co_set_id","code");--> statement-breakpoint
CREATE INDEX "obe_survey_ratings_survey_idx" ON "obe_survey_ratings" USING btree ("survey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_outcomes_code_uq" ON "program_outcomes" USING btree ("program_id","kind","code");