import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const names = [
  '20261105120000_sprint_001',
  '20261105180000_sprint_002_catalog_quotes',
  '20261105200000_sprint_002_discount_options',
  '20261106120000_sprint_003_orders_art_payments_reservations',
  '20261107120000_sprint_003_r1_asaas_completion',
  '20261108120000_sprint_003_r2_asaas_self_service',
] as const;
const sql = await Promise.all(
  names.map((name) =>
    readFile(
      new URL(`../../database/prisma/migrations/${name}/migration.sql`, import.meta.url),
      'utf8',
    ),
  ),
);
const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });
const emptySchema = 'sprint003r2_empty_verify';
const upgradeSchema = 'sprint003r2_upgrade_verify';

async function recreate(client: pg.PoolClient, schema: string) {
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema},public`);
}

try {
  await verifyConnectedTestDatabase(pool, policy);
  const client = await pool.connect();
  try {
    await recreate(client, emptySchema);
    for (const migration of sql) await client.query(migration);
    const empty = await client.query<{ methods: string | null; columns: number }>(`SELECT
      to_regclass('${emptySchema}.asaas_payment_methods')::text methods,
      (SELECT count(*)::int FROM information_schema.columns
       WHERE table_schema='${emptySchema}' AND table_name='asaas_connections'
       AND column_name IN ('notification_email_ciphertext','webhook_send_type','webhook_events')) columns`);
    if (!empty.rows[0]?.methods || empty.rows[0].columns !== 3)
      throw new Error('A cadeia vazia não criou o onboarding Asaas R2.');

    await recreate(client, upgradeSchema);
    for (const migration of sql.slice(0, 5)) await client.query(migration);
    await client.query(`
      INSERT INTO installation(singleton_key,id,company_name,timezone,currency)
      VALUES(true,'40000000-0000-4000-8000-000000000001','Empresa R1','America/Manaus','BRL');
      INSERT INTO users(id,name,email_normalized,password_hash,role,status)
      VALUES('40000000-0000-4000-8000-000000000002','Gestor','r2@example.test','hash','MANAGER','ACTIVE');
      INSERT INTO asaas_connections(id,environment,status,api_key_ciphertext,api_key_nonce,api_key_auth_tag,
        webhook_token_ciphertext,webhook_token_nonce,webhook_token_auth_tag,webhook_public_url,key_fingerprint,
        external_webhook_id,last_validated_at,created_by,updated_by)
      VALUES('40000000-0000-4000-8000-000000000003','SANDBOX','CONNECTED',decode('01','hex'),decode('02','hex'),decode('03','hex'),
        decode('04','hex'),decode('05','hex'),decode('06','hex'),'https://example.test/api/v1/webhooks/asaas/payments','123456789012',
        'wh_legacy',clock_timestamp(),'40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002');
      INSERT INTO audit_events(id,actor_type,actor_id,action,resource_type,resource_id,correlation_id)
      VALUES('40000000-0000-4000-8000-000000000004','USER','40000000-0000-4000-8000-000000000002','PRESERVED_R1',
        'asaas_connection','40000000-0000-4000-8000-000000000003','r2-check');
    `);
    await client.query(sql[5]!);
    const upgraded = await client.query<{ status: string; audits: number; connections: number }>(
      `SELECT (SELECT status FROM asaas_connections)::text status,
       (SELECT count(*) FROM audit_events)::int audits,
       (SELECT count(*) FROM asaas_connections)::int connections`,
    );
    const state = upgraded.rows[0];
    if (!state || state.status !== 'CONFIGURING' || state.audits !== 1 || state.connections !== 1)
      throw new Error('O upgrade R1 não preservou dados ou não exigiu revisão da conexão antiga.');

    await client.query('BEGIN');
    await client.query(`INSERT INTO asaas_payment_methods(id,connection_id,billing_type,enabled,updated_by)
      VALUES('40000000-0000-4000-8000-000000000099','40000000-0000-4000-8000-000000000003','PIX',false,
      '40000000-0000-4000-8000-000000000002')`);
    await client.query('ROLLBACK');
    const rollback = await client.query<{ count: number }>(
      'SELECT count(*)::int count FROM asaas_payment_methods',
    );
    if (rollback.rows[0]!.count !== 0) throw new Error('Rollback lógico R2 falhou.');
    process.stdout.write(
      `Cadeia vazia R2: PASSOU (${JSON.stringify(empty.rows[0])}).\n` +
        `Upgrade R1 preservado: PASSOU (${JSON.stringify(state)}).\nRollback lógico: PASSOU.\n`,
    );
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${emptySchema} CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS ${upgradeSchema} CASCADE`);
    client.release();
  }
} finally {
  await pool.end();
}
