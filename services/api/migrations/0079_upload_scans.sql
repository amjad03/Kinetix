CREATE TABLE "upload_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"signature" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_scans_status_ck" CHECK (status IN ('pending', 'clean', 'infected', 'error'))
);
--> statement-breakpoint
ALTER TABLE "upload_scans" ADD CONSTRAINT "upload_scans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_scans_subject_uq" ON "upload_scans" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "upload_scans_pending_idx" ON "upload_scans" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "vault_documents" ADD COLUMN "scan_status" text DEFAULT 'clean' NOT NULL;
