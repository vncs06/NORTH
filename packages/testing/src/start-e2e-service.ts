import 'dotenv/config';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';
import { configuredE2ePorts } from './e2e-ports.js';
import { runManagedProcess } from './managed-process.js';

const service = process.argv[2];
if (service !== 'api' && service !== 'web') {
  throw new Error('Serviço E2E inválido: use api ou web.');
}

const ports = configuredE2ePorts();
if (service === 'web') {
  await runManagedProcess('npm', ['run', 'start:e2e', '--workspace=@north/web'], {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(ports.web),
    NEXT_DIST_DIR: '.next-e2e',
    NEXT_OUTPUT_MODE: 'server',
    NEXT_PUBLIC_API_URL: `http://localhost:${ports.api}/api/v1`,
  });
}

const policy = configuredTestDatabasePolicy();
const verificationPool = new pg.Pool({ connectionString: policy.url, max: 1 });
try {
  await verifyConnectedTestDatabase(verificationPool, policy);
} finally {
  await verificationPool.end();
}

await runManagedProcess('npm', ['run', 'dev', '--workspace=@north/api'], {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: policy.url,
  START_HTTP_SERVER: 'true',
  API_PORT: String(ports.api),
  WEB_ORIGIN: `http://localhost:${ports.web}`,
});
