-- Library pass, part 1: the circulation rules matrix (member category by material), fines that skip closed days,
-- reservations for every member (staff too) with a "ready" notice, overdue notices, fines sent to fees linked to the
-- fee invoice, Colon and other classification schemes, and stock verification by copy.

-- One rule per member category and material (either may be empty: "every category" / "every material"). The most
-- specific rule wins: category and material, then category, then material, then the category's own figures.
CREATE TABLE IF NOT EXISTS "library_circ_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "category_id" uuid REFERENCES "library_member_categories"("id") ON DELETE cascade,
  "material" text,
  "loan_days" integer NOT NULL,
  "max_items" integer,
  "fine_paise_per_day" integer NOT NULL,
  "grace_days" integer DEFAULT 0 NOT NULL,
  "max_fine_paise" bigint DEFAULT 0 NOT NULL,
  "max_renewals" integer NOT NULL,
  "can_reserve" boolean DEFAULT true NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_circ_rules_uq" ON "library_circ_rules" ("tenant_id", coalesce("category_id", '00000000-0000-0000-0000-000000000000'::uuid), coalesce("material", ''));--> statement-breakpoint

-- Reservations belong to a member (a student's card or a teacher's); the student link stays for families.
ALTER TABLE "library_reservations" ADD COLUMN IF NOT EXISTS "member_id" uuid REFERENCES "library_members"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "library_reservations" ADD COLUMN IF NOT EXISTS "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "library_reservations" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "library_reservations" r SET "member_id" = m.id FROM "library_members" m WHERE r.member_id IS NULL AND m.student_id = r.student_id;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_reservations_member_idx" ON "library_reservations" ("member_id", "status");--> statement-breakpoint

-- The days a late fine was charged for (closed days and the grace period left out), the fee invoice a fine went to,
-- and how many overdue notices the borrower has had.
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "fine_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "fine_invoice_id" uuid REFERENCES "fee_invoices"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "notices_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "last_notice_at" timestamp with time zone;--> statement-breakpoint
UPDATE "library_loans" l SET "fine_invoice_id" = i.id FROM "fee_invoices" i WHERE l.fine_invoice_title IS NOT NULL AND l.fine_invoice_id IS NULL AND i.title = l.fine_invoice_title AND i.student_id = l.student_id;--> statement-breakpoint

-- Each notice sent about a loan (due soon, first, second, final), once per step.
CREATE TABLE IF NOT EXISTS "library_overdue_notices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "loan_id" uuid NOT NULL REFERENCES "library_loans"("id") ON DELETE cascade,
  "step" text NOT NULL,
  "days_overdue" integer DEFAULT 0 NOT NULL,
  "channels" text DEFAULT 'app' NOT NULL,
  "recipients" integer DEFAULT 0 NOT NULL,
  "sent_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_overdue_notices_uq" ON "library_overdue_notices" ("loan_id", "step");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_overdue_notices_sent_idx" ON "library_overdue_notices" ("tenant_id", "sent_at");--> statement-breakpoint

-- Classification: DDC (the default), Colon Classification, UDC or LCC; the class and book numbers make the call number.
ALTER TABLE "library_books" ADD COLUMN IF NOT EXISTS "class_scheme" text DEFAULT 'ddc' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_books" ADD COLUMN IF NOT EXISTS "class_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_books" ADD COLUMN IF NOT EXISTS "book_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "library_books" SET "class_number" = "ddc" WHERE "class_number" = '' AND coalesce("ddc", '') <> '';--> statement-breakpoint

-- Stock verification by accession: each copy found on the shelf, and the branch or shelf range a check covers.
ALTER TABLE "library_stock_checks" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "library_branches"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "library_stock_checks" ADD COLUMN IF NOT EXISTS "shelf_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_stock_check_copies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "check_id" uuid NOT NULL REFERENCES "library_stock_checks"("id") ON DELETE cascade,
  "copy_id" uuid NOT NULL REFERENCES "library_copies"("id") ON DELETE cascade,
  "prior_status" text NOT NULL,
  "scanned_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_stock_check_copies_uq" ON "library_stock_check_copies" ("check_id", "copy_id");--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['library_circ_rules', 'library_overdue_notices', 'library_stock_check_copies'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
