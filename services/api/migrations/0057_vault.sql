CREATE TABLE "vault_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"student_id" uuid,
	"staff_user_id" uuid,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"replaces_id" uuid,
	"visibility" text DEFAULT 'staff' NOT NULL,
	"expires_on" date,
	"uploaded_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_documents_student_idx" ON "vault_documents" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "vault_documents_staff_idx" ON "vault_documents" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "vault_documents_expiry_idx" ON "vault_documents" USING btree ("tenant_id","expires_on");