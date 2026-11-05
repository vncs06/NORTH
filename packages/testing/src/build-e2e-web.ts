import 'dotenv/config';
import { configuredE2ePorts } from './e2e-ports.js';
import { runManagedProcess } from './managed-process.js';

const ports = configuredE2ePorts();
await runManagedProcess('npm', ['run', 'build:e2e', '--workspace=@north/web'], {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_OUTPUT_MODE: 'server',
  NEXT_PUBLIC_API_URL: `http://localhost:${ports.api}/api/v1`,
});
