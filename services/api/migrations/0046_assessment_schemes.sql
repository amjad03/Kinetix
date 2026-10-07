CREATE TYPE "public"."component_kind" AS ENUM('internal', 'external', 'practical', 'project', 'viva');--> statement-breakpoint
CREATE TYPE "public"."mark_status" AS ENUM('draft', 'submitted', 'verified', 'moderated');--> statement-breakpoint
CREATE TABLE "assessment_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"credits" numeric(4, 1) NOT NULL,
	"pass_rules" jsonb NOT NULL,
	"grade_scale_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "component_kind" NOT NULL,
	"weight" numeric(5, 2) NOT NULL,
	"ord" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "component_id" uuid;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "mark_status" "mark_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "moderated_by" uuid;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "moderated_marks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_grade_scale_id_grade_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_components" ADD CONSTRAINT "scheme_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_components" ADD CONSTRAINT "scheme_components_scheme_id_assessment_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."assessment_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_schemes_subject_year_uq" ON "assessment_schemes" USING btree ("subject_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheme_components_code_uq" ON "scheme_components" USING btree ("scheme_id","code");--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_component_id_scheme_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."scheme_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;