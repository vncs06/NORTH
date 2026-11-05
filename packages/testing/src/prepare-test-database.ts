import 'dotenv/config';
import pg from 'pg';
import {
  configuredTestDatabasePolicy,
  maintenanceDatabaseUrl,
  verifyConnectedTestDatabase,
} from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const maintenancePool = new pg.Pool({
  connectionString: maintenanceDatabaseUrl(policy),
  max: 1,
});

try {
  const existing = await maintenancePool.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='north_test') AS exists",
  );
  if (!existing.rows[0]?.exists) {
    await maintenancePool.query('CREATE DATABASE north_test');
    process.stdout.write('Banco dedicado north_test criado.\n');
  } else {
    process.stdout.write('Banco dedicado north_test já existe.\n');
  }
} finally {
  await maintenancePool.end();
}

const testPool = new pg.Pool({ connectionString: policy.url, max: 1 });
try {
  const database = await verifyConnectedTestDatabase(testPool, policy);
  process.stdout.write(`Banco de teste validado: ${database}.\n`);
} finally {
  await testPool.end();
}
