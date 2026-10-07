ALTER TYPE "public"."notification_kind" ADD VALUE 'leave';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'payslip';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'certificate';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE 'hr_manager';--> statement-breakpoint
CREATE TABLE "designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_attendance" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"source" text NOT NULL,
	"note" text,
	"marked_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_attendance_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"department_id" uuid,
	"designation_id" uuid,
	"employment_type" text DEFAULT 'permanent' NOT NULL,
	"date_of_joining" date,
	"date_of_leaving" date,
	"status" text DEFAULT 'active' NOT NULL,
	"gender" text,
	"date_of_birth" date,
	"pan" text,
	"uan" text,
	"esi_number" text,
	"tax_regime" text DEFAULT 'new' NOT NULL,
	"tax_80c_paise" bigint DEFAULT 0 NOT NULL,
	"tax_other_deductions_paise" bigint DEFAULT 0 NOT NULL,
	"pf_enabled" boolean DEFAULT true NOT NULL,
	"esi_enabled" boolean DEFAULT false NOT NULL,
	"pt_enabled" boolean DEFAULT true NOT NULL,
	"bank_account_holder" text,
	"bank_name" text,
	"bank_ifsc" text,
	"bank_account_enc" text,
	"bank_account_last4" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_designation_id_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."designations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "designations_name_uq" ON "designations" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "staff_attendance_date_idx" ON "staff_attendance" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_code_uq" ON "staff_profiles" USING btree ("tenant_id","employee_code");--> statement-breakpoint
CREATE INDEX "staff_profiles_dept_idx" ON "staff_profiles" USING btree ("department_id");