import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '@north/database';
import { logEvent } from '@north/observability';
import { FulfillmentRepository } from '../../api/src/fulfillment-repository.js';

const fulfillment = new FulfillmentRepository();
const workerId = `worker-${process.pid}-${randomUUID()}`;

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

async function processQueues(): Promise<void> {
  try {
    let processed = false;
    processed = (await fulfillment.processOneOutbox(workerId)) || processed;
    processed = (await fulfillment.processOneWebhook(workerId)) || processed;
    if (processed) {
      logEvent({ level: 'info', event: 'WORKER_ITEM_PROCESSED', correlationId: randomUUID() });
    }
  } catch {
    logEvent({ level: 'error', event: 'WORKER_PROCESSING_FAILED', correlationId: randomUUID() });
  }
}

await processQueues();
if (process.env.WORKER_ONCE !== 'true') {
  setInterval(() => void heartbeat(), 60_000).unref();
  setInterval(() => void processQueues(), Number(process.env.WORKER_POLL_MS ?? 2_000)).unref();
}
