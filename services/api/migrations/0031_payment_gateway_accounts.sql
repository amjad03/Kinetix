CREATE TABLE "payment_gateway_accounts" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"key_id" text NOT NULL,
	"key_secret_enc" text NOT NULL,
	"key_secret_last4" text NOT NULL,
	"webhook_secret_enc" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD CONSTRAINT "payment_gateway_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD CONSTRAINT "payment_gateway_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;