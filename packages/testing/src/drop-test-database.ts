import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, maintenanceDatabaseUrl } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: maintenanceDatabaseUrl(policy), max: 1 });
try {
  await pool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='north_test' AND pid<>pg_backend_pid()",
  );
  await pool.query('DROP DATABASE IF EXISTS north_test');
  process.stdout.write('Banco dedicado north_test removido.\n');
} finally {
  await pool.end();
}
