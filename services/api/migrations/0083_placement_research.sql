CREATE TABLE "placement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"package_paise" bigint DEFAULT 0 NOT NULL,
	"offered_on" date NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_records_status_ck" CHECK (status IN ('offered', 'joined', 'declined'))
);
--> statement-breakpoint
CREATE TABLE "research_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_user_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"published_on" date NOT NULL,
	"grant_paise" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_outputs_kind_ck" CHECK (kind IN ('paper', 'book', 'patent', 'project', 'conference'))
);
--> statement-breakpoint
ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_outputs" ADD CONSTRAINT "research_outputs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_outputs" ADD CONSTRAINT "research_outputs_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_outputs" ADD CONSTRAINT "research_outputs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placement_records_tenant_idx" ON "placement_records" USING btree ("tenant_id","offered_on");--> statement-breakpoint
CREATE INDEX "research_outputs_tenant_idx" ON "research_outputs" USING btree ("tenant_id","published_on");
