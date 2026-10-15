-- Library depth: catalogue details (publisher, edition, DDC, subject), branches, the accession register (one row per
-- copy, with barcode and RFID), member categories and members (students, staff and external readers, with deposits
-- and cards), acquisitions against department budgets, periodicals with issue check-in and claims, the institutional
-- repository, inter-library loans, the gate register, fine waivers, new-arrival alerts and no-dues clearances.
ALTER TABLE "library_books"
  ADD COLUMN IF NOT EXISTS "publisher" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "edition" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pub_year" smallint,
  ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "subject" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "ddc" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "keywords" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pages" integer,
  ADD COLUMN IF NOT EXISTS "material" text NOT NULL DEFAULT 'book',
  ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "marc" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_branches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "code" text NOT NULL DEFAULT '',
  "is_main" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_branches_name_uq" ON "library_branches" ("tenant_id", lower("name"));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fiscal_year" text NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE CASCADE,
  "head" text NOT NULL DEFAULT 'books',
  "amount_paise" bigint NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_budgets_uq" ON "library_budgets" ("tenant_id", "fiscal_year", coalesce("department_id", '00000000-0000-0000-0000-000000000000'::uuid), "head");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_acquisitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "title" text NOT NULL,
  "author" text NOT NULL DEFAULT '',
  "isbn" text NOT NULL DEFAULT '',
  "publisher" text NOT NULL DEFAULT '',
  "edition" text NOT NULL DEFAULT '',
  "quantity" integer NOT NULL DEFAULT 1,
  "est_price_paise" bigint NOT NULL DEFAULT 0,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "budget_id" uuid REFERENCES "library_budgets"("id") ON DELETE SET NULL,
  "suggested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "suggested_by_name" text NOT NULL DEFAULT '',
  "reason" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'suggested',
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text NOT NULL DEFAULT '',
  "vendor" text NOT NULL DEFAULT '',
  "order_no" text NOT NULL DEFAULT '',
  "ordered_on" date,
  "received_qty" integer NOT NULL DEFAULT 0,
  "received_on" date,
  "invoice_no" text NOT NULL DEFAULT '',
  "invoice_date" date,
  "invoice_amount_paise" bigint NOT NULL DEFAULT 0,
  "book_id" uuid REFERENCES "library_books"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_acquisitions_status_idx" ON "library_acquisitions" ("tenant_id", "status", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_copies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "book_id" uuid NOT NULL REFERENCES "library_books"("id") ON DELETE CASCADE,
  "accession_no" text NOT NULL,
  "barcode" text,
  "rfid" text,
  "branch_id" uuid REFERENCES "library_branches"("id") ON DELETE SET NULL,
  "at_branch_id" uuid REFERENCES "library_branches"("id") ON DELETE SET NULL,
  "shelf" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'available',
  "acquired_on" date,
  "source" text NOT NULL DEFAULT 'purchase',
  "price_paise" bigint NOT NULL DEFAULT 0,
  "vendor" text NOT NULL DEFAULT '',
  "invoice_no" text NOT NULL DEFAULT '',
  "acquisition_id" uuid REFERENCES "library_acquisitions"("id") ON DELETE SET NULL,
  "withdrawn_on" date,
  "withdrawn_reason" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_copies_accession_uq" ON "library_copies" ("tenant_id", "accession_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_copies_barcode_uq" ON "library_copies" ("tenant_id", "barcode") WHERE "barcode" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_copies_rfid_uq" ON "library_copies" ("tenant_id", "rfid") WHERE "rfid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_copies_book_idx" ON "library_copies" ("book_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_member_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'student',
  "loan_days" smallint NOT NULL DEFAULT 14,
  "max_books" smallint NOT NULL DEFAULT 4,
  "fine_paise_per_day" integer NOT NULL DEFAULT 200,
  "max_renewals" smallint NOT NULL DEFAULT 2,
  "can_reserve" boolean NOT NULL DEFAULT true,
  "deposit_paise" bigint NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_member_categories_name_uq" ON "library_member_categories" ("tenant_id", lower("name"));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "card_no" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'student',
  "student_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "full_name" text NOT NULL,
  "phone" text NOT NULL DEFAULT '',
  "email" text NOT NULL DEFAULT '',
  "organisation" text NOT NULL DEFAULT '',
  "category_id" uuid REFERENCES "library_member_categories"("id"),
  "status" text NOT NULL DEFAULT 'active',
  "valid_until" date,
  "deposit_paise" bigint NOT NULL DEFAULT 0,
  "deposit_paid_on" date,
  "deposit_refunded_on" date,
  "deposit_receipt" text NOT NULL DEFAULT '',
  "blocked_reason" text NOT NULL DEFAULT '',
  "card_reissues" smallint NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_members_card_uq" ON "library_members" ("tenant_id", "card_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_members_student_uq" ON "library_members" ("student_id") WHERE "student_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_members_user_uq" ON "library_members" ("user_id") WHERE "user_id" IS NOT NULL AND "student_id" IS NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans"
  ADD COLUMN IF NOT EXISTS "member_id" uuid REFERENCES "library_members"("id"),
  ADD COLUMN IF NOT EXISTS "copy_id" uuid REFERENCES "library_copies"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "library_branches"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "returned_branch_id" uuid REFERENCES "library_branches"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "fine_waived_paise" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fine_invoice_title" text,
  ADD COLUMN IF NOT EXISTS "book_bank" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "via" text NOT NULL DEFAULT 'desk',
  ADD COLUMN IF NOT EXISTS "returned_via" text;--> statement-breakpoint
ALTER TABLE "library_loans" DROP CONSTRAINT IF EXISTS "library_loans_borrower_ck";--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_borrower_ck" CHECK ("student_id" IS NOT NULL OR "member_id" IS NOT NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_loans_member_idx" ON "library_loans" ("member_id", "returned_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_fine_waivers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "loan_id" uuid NOT NULL REFERENCES "library_loans"("id") ON DELETE CASCADE,
  "amount_paise" bigint NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_periodicals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "issn" text NOT NULL DEFAULT '',
  "publisher" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'journal',
  "frequency" text NOT NULL DEFAULT 'monthly',
  "language" text NOT NULL DEFAULT '',
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "vendor" text NOT NULL DEFAULT '',
  "subscription_from" date,
  "subscription_to" date,
  "cost_paise" bigint NOT NULL DEFAULT 0,
  "budget_id" uuid REFERENCES "library_budgets"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_periodical_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "periodical_id" uuid NOT NULL REFERENCES "library_periodicals"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "expected_on" date NOT NULL,
  "received_on" date,
  "status" text NOT NULL DEFAULT 'expected',
  "claimed_on" date,
  "claim_note" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_periodical_issues_uq" ON "library_periodical_issues" ("periodical_id", "label");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_repository" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "authors" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'paper',
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "year" smallint,
  "abstract" text NOT NULL DEFAULT '',
  "keywords" text NOT NULL DEFAULT '',
  "url" text NOT NULL,
  "access" text NOT NULL DEFAULT 'campus',
  "status" text NOT NULL DEFAULT 'draft',
  "views" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_repository_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "library_repository"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_repository_access_idx" ON "library_repository_access" ("item_id", "accessed_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_ill" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "direction" text NOT NULL DEFAULT 'borrow',
  "network" text NOT NULL DEFAULT 'direct',
  "partner" text NOT NULL,
  "title" text NOT NULL,
  "author" text NOT NULL DEFAULT '',
  "isbn" text NOT NULL DEFAULT '',
  "member_id" uuid REFERENCES "library_members"("id") ON DELETE SET NULL,
  "requested_on" date NOT NULL,
  "due_on" date,
  "status" text NOT NULL DEFAULT 'requested',
  "charge_paise" bigint NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_gate_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "member_id" uuid REFERENCES "library_members"("id") ON DELETE CASCADE,
  "visitor_name" text NOT NULL DEFAULT '',
  "purpose" text NOT NULL DEFAULT 'reading',
  "branch_id" uuid REFERENCES "library_branches"("id") ON DELETE SET NULL,
  "in_at" timestamp with time zone NOT NULL,
  "out_at" timestamp with time zone,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_gate_log_in_idx" ON "library_gate_log" ("tenant_id", "in_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_alert_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topics" text NOT NULL DEFAULT '',
  "last_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_alert_subscriptions_user_uq" ON "library_alert_subscriptions" ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_clearances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "library_members"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL DEFAULT 'exit',
  "note" text NOT NULL DEFAULT '',
  "issued_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
-- The accession register starts with one copy row per copy already in the catalogue, numbered ACC-0001 onwards in
-- the order the books were added; copies out on loan now are tied to their loans.
INSERT INTO "library_copies" ("tenant_id", "book_id", "accession_no", "barcode", "status", "price_paise", "acquired_on")
SELECT x.tenant_id, x.book_id, x.acc, x.acc, 'available', x.price_paise, x.acquired_on
FROM (
  SELECT b.tenant_id, b.id AS book_id, b.price_paise, b.created_at::date AS acquired_on,
         'ACC-' || lpad(n::text, greatest(4, length(n::text)), '0') AS acc
  FROM (
    SELECT b.*, row_number() OVER (PARTITION BY b.tenant_id ORDER BY b.created_at, b.id, g.k) AS n
    FROM "library_books" b CROSS JOIN LATERAL generate_series(1, greatest(b.copies, 0)) AS g(k)
    WHERE NOT EXISTS (SELECT 1 FROM "library_copies" c WHERE c.book_id = b.id)
  ) b
) x;--> statement-breakpoint
INSERT INTO "doc_counters" ("tenant_id", "kind", "last_no")
SELECT tenant_id, 'ACC', count(*)::int FROM "library_copies" GROUP BY tenant_id
ON CONFLICT ("tenant_id", "kind") DO UPDATE SET "last_no" = greatest("doc_counters"."last_no", excluded."last_no");--> statement-breakpoint
WITH open_loans AS (
  SELECT l.id, l.book_id, row_number() OVER (PARTITION BY l.book_id ORDER BY l.issued_at, l.id) AS rn FROM "library_loans" l WHERE l.returned_at IS NULL AND l.copy_id IS NULL
), copies AS (
  SELECT c.id, c.book_id, row_number() OVER (PARTITION BY c.book_id ORDER BY c.accession_no) AS rn FROM "library_copies" c
)
UPDATE "library_loans" l SET "copy_id" = copies.id FROM open_loans JOIN copies ON copies.book_id = open_loans.book_id AND copies.rn = open_loans.rn WHERE l.id = open_loans.id;--> statement-breakpoint
UPDATE "library_copies" c SET "status" = 'on_loan' WHERE EXISTS (SELECT 1 FROM "library_loans" l WHERE l.copy_id = c.id AND l.returned_at IS NULL);--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['library_branches', 'library_budgets', 'library_acquisitions', 'library_copies', 'library_member_categories', 'library_members', 'library_fine_waivers', 'library_periodicals', 'library_periodical_issues', 'library_repository', 'library_repository_access', 'library_ill', 'library_gate_log', 'library_alert_subscriptions', 'library_clearances'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zynetix_app', t);
    END IF;
  END LOOP;
END $$;
