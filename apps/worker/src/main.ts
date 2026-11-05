import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '@north/database';
import { logEvent } from '@north/observability';

async function heartbeat(): Promise<void> {
  const id = randomUUID();
  try {
    await pool.query('SELECT 1');
    logEvent({ level: 'info', event: 'WORKER_HEARTBEAT', correlationId: id });
  } catch {
    logEvent({ level: 'error', event: 'WORKER_DATABASE_UNAVAILABLE', correlationId: id });
  }
}

await heartbeat();
setInterval(() => void heartbeat(), 60_000).unref();
