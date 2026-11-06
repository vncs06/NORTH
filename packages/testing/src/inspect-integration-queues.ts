import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(
    `SELECT 'outbox' AS queue,status,count(*)::int AS count FROM integration_outbox GROUP BY status
     UNION ALL
     SELECT 'webhook_inbox',status,count(*)::int FROM asaas_webhook_inbox GROUP BY status
     ORDER BY queue,status`,
  );
  process.stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
} finally {
  await pool.end();
}
