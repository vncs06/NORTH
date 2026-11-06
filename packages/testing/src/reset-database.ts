import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });

try {
  await verifyConnectedTestDatabase(pool, policy);
  await pool.query(`TRUNCATE quote_pricing_component_snapshots,quote_material_snapshots,quote_items,
    quotes,pricing_components,discount_policy_options,discount_policies,pricing_policies,technical_sheet_components,
    technical_sheets,catalog_combinations,customization_techniques,product_variants,products,
    customers,audit_events,idempotency_records,inventory_movements,material_costs,
    inventory_balances,materials,sessions,users,installation RESTART IDENTITY CASCADE`);
  await pool.query("SELECT setval('quote_commercial_number_seq',1,false)");
  process.stdout.write(`Banco dedicado ${policy.database} limpo.\n`);
} finally {
  await pool.end();
}
