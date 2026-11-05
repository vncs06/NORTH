import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });

try {
  await verifyConnectedTestDatabase(pool, policy);
  await pool.query(`TRUNCATE audit_events,idempotency_records,inventory_movements,material_costs,
    inventory_balances,materials,sessions,users,installation RESTART IDENTITY CASCADE`);
  process.stdout.write(`Banco dedicado ${policy.database} limpo.\n`);
} finally {
  await pool.end();
}
