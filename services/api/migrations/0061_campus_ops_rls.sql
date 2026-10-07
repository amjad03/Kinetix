-- Row-level security for transport, hostel, canteen, inventory and assets (pattern from 0038_polls_rls.sql).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transport_vehicles', 'transport_drivers', 'transport_routes', 'transport_stops', 'transport_assignments', 'transport_trips', 'transport_trip_events', 'hostel_blocks', 'hostel_rooms', 'hostel_beds', 'hostel_allotments', 'hostel_gate_passes', 'hostel_visitors', 'hostel_complaints', 'mess_plans', 'mess_subscriptions', 'mess_menu', 'canteen_items', 'canteen_wallets', 'canteen_wallet_txns', 'inv_stores', 'inv_items', 'inv_stock', 'inv_stock_moves', 'inv_vendors', 'inv_requisitions', 'inv_requisition_lines', 'inv_purchase_orders', 'inv_po_lines', 'inv_goods_receipts', 'inv_goods_receipt_lines', 'inv_invoices', 'assets', 'asset_allocations', 'asset_maintenance', 'doc_counters'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kinetix_app', t);
    END IF;
  END LOOP;
END $$;
