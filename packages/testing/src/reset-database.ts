import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });

try {
  await verifyConnectedTestDatabase(pool, policy);
  await pool.query(`TRUNCATE inventory_reservation_alerts,inventory_reservations,artwork_approvals,
    artwork_versions,object_files,asaas_webhook_inbox,integration_outbox,payment_charges,
    asaas_customer_bindings,asaas_payment_methods,asaas_connections,financial_decisions,order_state_history,
    order_material_requirements,order_items,orders,deposit_policies,
    quote_pricing_component_snapshots,quote_material_snapshots,quote_items,
    quotes,pricing_components,discount_policy_options,discount_policies,pricing_policies,technical_sheet_components,
    technical_sheets,catalog_combinations,customization_techniques,product_variants,products,
    customers,audit_events,idempotency_records,inventory_movements,material_costs,
    inventory_balances,materials,sessions,users,installation RESTART IDENTITY CASCADE`);
  await pool.query("SELECT setval('quote_commercial_number_seq',1,false)");
  await pool.query("SELECT setval('order_commercial_number_seq',1,false)");
  process.stdout.write(`Banco dedicado ${policy.database} limpo.\n`);
} finally {
  await pool.end();
}
