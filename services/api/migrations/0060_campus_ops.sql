CREATE TABLE "asset_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"assigned_to" text NOT NULL,
	"user_id" uuid,
	"allocated_on" date NOT NULL,
	"returned_on" date
);
--> statement-breakpoint
CREATE TABLE "asset_maintenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"done_on" date NOT NULL,
	"next_due_on" date,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"purchased_on" date NOT NULL,
	"cost_paise" bigint NOT NULL,
	"salvage_paise" bigint DEFAULT 0 NOT NULL,
	"useful_life_years" integer NOT NULL,
	"method" text DEFAULT 'slm' NOT NULL,
	"wdv_rate_pct" numeric(5, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"disposed_on" date,
	"disposal_paise" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteen_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteen_wallet_txns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"delta_paise" integer NOT NULL,
	"kind" text NOT NULL,
	"items" jsonb,
	"idempotency_key" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteen_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"balance_paise" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_counters" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"last_no" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "doc_counters_tenant_id_kind_pk" PRIMARY KEY("tenant_id","kind")
);
--> statement-breakpoint
CREATE TABLE "hostel_allotments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"vacated_on" date,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_beds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gender" text DEFAULT 'mixed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid,
	"room_id" uuid,
	"raised_by" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_gate_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"expected_back_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"out_at" timestamp with time zone,
	"in_at" timestamp with time zone,
	"issued_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"number" text NOT NULL,
	"floor" integer DEFAULT 0 NOT NULL,
	"monthly_fee_paise" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"visitor_name" text NOT NULL,
	"relation" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"id_proof" text DEFAULT '' NOT NULL,
	"in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"out_at" timestamp with time zone,
	"logged_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"po_line_id" uuid NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"received_by" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"idempotency_key" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"expected_paise" bigint NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"unit" text DEFAULT 'nos' NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_po_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"requisition_id" uuid,
	"vendor_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"total_paise" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_stock_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"issued_to" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gstin" text,
	"phone" text DEFAULT '' NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mess_menu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"meal" text NOT NULL,
	"items" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mess_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"monthly_fee_paise" integer NOT NULL,
	"meals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mess_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ended_on" date
);
--> statement-breakpoint
CREATE TABLE "transport_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'driver' NOT NULL,
	"license_no" text,
	"license_expires_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle_id" uuid,
	"driver_id" uuid,
	"monthly_fee_paise" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"name" text NOT NULL,
	"seq" integer NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"pickup_time" text
);
--> statement-breakpoint
CREATE TABLE "transport_trip_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stop_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_stop_seq" integer DEFAULT 0 NOT NULL,
	"last_lat" numeric(9, 6),
	"last_lng" numeric(9, 6),
	"last_speed_kmh" numeric(6, 1),
	"last_ping_at" timestamp with time zone,
	"pings" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reg_no" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"capacity" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"insurance_expires_on" date,
	"fitness_expires_on" date,
	"puc_expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_items" ADD CONSTRAINT "canteen_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_wallet_txns" ADD CONSTRAINT "canteen_wallet_txns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_wallet_txns" ADD CONSTRAINT "canteen_wallet_txns_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_wallet_txns" ADD CONSTRAINT "canteen_wallet_txns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_wallets" ADD CONSTRAINT "canteen_wallets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_wallets" ADD CONSTRAINT "canteen_wallets_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_counters" ADD CONSTRAINT "doc_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_bed_id_hostel_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."hostel_beds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_blocks" ADD CONSTRAINT "hostel_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_block_id_hostel_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."hostel_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_visitors" ADD CONSTRAINT "hostel_visitors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_visitors" ADD CONSTRAINT "hostel_visitors_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_visitors" ADD CONSTRAINT "hostel_visitors_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD CONSTRAINT "inv_goods_receipt_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD CONSTRAINT "inv_goods_receipt_lines_receipt_id_inv_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."inv_goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_goods_receipt_lines" ADD CONSTRAINT "inv_goods_receipt_lines_po_line_id_inv_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."inv_po_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD CONSTRAINT "inv_goods_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD CONSTRAINT "inv_goods_receipts_po_id_inv_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."inv_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_goods_receipts" ADD CONSTRAINT "inv_goods_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_po_id_inv_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."inv_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_vendor_id_inv_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."inv_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_invoices" ADD CONSTRAINT "inv_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_items" ADD CONSTRAINT "inv_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_po_lines" ADD CONSTRAINT "inv_po_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_po_lines" ADD CONSTRAINT "inv_po_lines_po_id_inv_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."inv_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_po_lines" ADD CONSTRAINT "inv_po_lines_item_id_inv_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inv_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD CONSTRAINT "inv_purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD CONSTRAINT "inv_purchase_orders_requisition_id_inv_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."inv_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD CONSTRAINT "inv_purchase_orders_vendor_id_inv_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."inv_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD CONSTRAINT "inv_purchase_orders_store_id_inv_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."inv_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_purchase_orders" ADD CONSTRAINT "inv_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_requisition_lines" ADD CONSTRAINT "inv_requisition_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_requisition_lines" ADD CONSTRAINT "inv_requisition_lines_requisition_id_inv_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."inv_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_requisition_lines" ADD CONSTRAINT "inv_requisition_lines_item_id_inv_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inv_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD CONSTRAINT "inv_requisitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD CONSTRAINT "inv_requisitions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_requisitions" ADD CONSTRAINT "inv_requisitions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock" ADD CONSTRAINT "inv_stock_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock" ADD CONSTRAINT "inv_stock_store_id_inv_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."inv_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock" ADD CONSTRAINT "inv_stock_item_id_inv_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inv_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD CONSTRAINT "inv_stock_moves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD CONSTRAINT "inv_stock_moves_store_id_inv_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."inv_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD CONSTRAINT "inv_stock_moves_item_id_inv_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inv_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_moves" ADD CONSTRAINT "inv_stock_moves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stores" ADD CONSTRAINT "inv_stores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_vendors" ADD CONSTRAINT "inv_vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_menu" ADD CONSTRAINT "mess_menu_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_plans" ADD CONSTRAINT "mess_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_subscriptions" ADD CONSTRAINT "mess_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_subscriptions" ADD CONSTRAINT "mess_subscriptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_subscriptions" ADD CONSTRAINT "mess_subscriptions_plan_id_mess_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."mess_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_stop_id_transport_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."transport_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD CONSTRAINT "transport_drivers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_drivers" ADD CONSTRAINT "transport_drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicle_id_transport_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."transport_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_driver_id_transport_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."transport_drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trip_events" ADD CONSTRAINT "transport_trip_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trip_events" ADD CONSTRAINT "transport_trip_events_trip_id_transport_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."transport_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trip_events" ADD CONSTRAINT "transport_trip_events_stop_id_transport_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."transport_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_allocations_active_uq" ON "asset_allocations" USING btree ("asset_id") WHERE returned_on is null;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_tag_uq" ON "assets" USING btree ("tenant_id","tag");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_items_name_uq" ON "canteen_items" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_txn_key_uq" ON "canteen_wallet_txns" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "canteen_txn_student_idx" ON "canteen_wallet_txns" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_wallets_student_uq" ON "canteen_wallets" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_allotments_student_uq" ON "hostel_allotments" USING btree ("student_id") WHERE vacated_on is null;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_allotments_bed_uq" ON "hostel_allotments" USING btree ("bed_id") WHERE vacated_on is null;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_beds_label_uq" ON "hostel_beds" USING btree ("room_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_blocks_name_uq" ON "hostel_blocks" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "hostel_complaints_status_idx" ON "hostel_complaints" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "hostel_gate_passes_student_idx" ON "hostel_gate_passes" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_rooms_number_uq" ON "hostel_rooms" USING btree ("block_id","number");--> statement-breakpoint
CREATE INDEX "hostel_visitors_student_idx" ON "hostel_visitors" USING btree ("student_id","in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_grn_key_uq" ON "inv_goods_receipts" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_invoices_vendor_no_uq" ON "inv_invoices" USING btree ("tenant_id","vendor_id","invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_items_sku_uq" ON "inv_items" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_po_number_uq" ON "inv_purchase_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_requisitions_number_uq" ON "inv_requisitions" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_stock_uq" ON "inv_stock" USING btree ("store_id","item_id");--> statement-breakpoint
CREATE INDEX "inv_stock_moves_item_idx" ON "inv_stock_moves" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_stores_name_uq" ON "inv_stores" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_vendors_name_uq" ON "inv_vendors" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "mess_menu_slot_uq" ON "mess_menu" USING btree ("tenant_id","day_of_week","meal");--> statement-breakpoint
CREATE UNIQUE INDEX "mess_plans_name_uq" ON "mess_plans" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "mess_subscriptions_active_uq" ON "mess_subscriptions" USING btree ("student_id") WHERE ended_on is null;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_assignments_active_uq" ON "transport_assignments" USING btree ("student_id") WHERE ended_on is null;--> statement-breakpoint
CREATE INDEX "transport_assignments_route_idx" ON "transport_assignments" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_name_uq" ON "transport_routes" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_stops_seq_uq" ON "transport_stops" USING btree ("route_id","seq");--> statement-breakpoint
CREATE INDEX "transport_trip_events_trip_idx" ON "transport_trip_events" USING btree ("trip_id","at");--> statement-breakpoint
CREATE INDEX "transport_trips_route_idx" ON "transport_trips" USING btree ("route_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_vehicles_reg_uq" ON "transport_vehicles" USING btree ("tenant_id","reg_no");