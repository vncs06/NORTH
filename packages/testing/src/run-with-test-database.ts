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
});
