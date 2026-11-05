import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });
try {
  const database = await verifyConnectedTestDatabase(pool, policy);
  process.stdout.write(`Configuração segura: banco ${database} validado.\n`);
} finally {
  await pool.end();
}
