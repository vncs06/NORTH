import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';
import { runManagedProcess } from './managed-process.js';

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Comando isolado de teste não informado.');

const policy = configuredTestDatabasePolicy();
const verificationPool = new pg.Pool({ connectionString: policy.url, max: 1 });
try {
  await verifyConnectedTestDatabase(verificationPool, policy);
} finally {
  await verificationPool.end();
}

await runManagedProcess(command, args, {
  ...process.env,
  NODE_ENV: 'test',
  DEVELOPMENT_DATABASE_URL: process.env.DEVELOPMENT_DATABASE_URL ?? process.env.DATABASE_URL,
  DATABASE_URL: policy.url,
  NORTH_SECRET_MASTER_KEY:
    process.env.NORTH_SECRET_MASTER_KEY ??
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  OBJECT_STORAGE_ROOT:
    process.env.OBJECT_STORAGE_ROOT ?? `${process.cwd()}/test-results/private-objects`,
  ASAAS_BASE_URL: process.env.ASAAS_BASE_URL ?? 'http://127.0.0.1:3199/v3',
});
