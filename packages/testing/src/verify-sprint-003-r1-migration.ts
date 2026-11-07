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
const emptySchema = 'sprint003r1_empty_verify';
const upgradeSchema = 'sprint003r1_upgrade_verify';

interface PreservedState {
  deposits: number;
  connections: number;
  audits: number;
}

interface UpgradedState extends PreservedState {
  mode: string;
  connection_status: string;
}

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
    const empty = await client.query(`SELECT
      to_regclass('${emptySchema}.asaas_fee_snapshots')::text fees,
      to_regclass('${emptySchema}.payment_fee_policies')::text policies,
      to_regclass('${emptySchema}.quote_payment_fee_snapshots')::text quote_fees`);
    if (Object.values(empty.rows[0] as Record<string, unknown>).some((value) => !value))
      throw new Error('A cadeia vazia não criou as estruturas corretivas.');

    await recreate(client, upgradeSchema);
    for (const migration of sql.slice(0, 4)) await client.query(migration);
    await client.query(`
      INSERT INTO installation(singleton_key,id,company_name,timezone,currency)
      VALUES(true,'30000000-0000-4000-8000-000000000001','Empresa preservada','America/Manaus','BRL');
      INSERT INTO users(id,name,email_normalized,password_hash,role,status)
      VALUES('30000000-0000-4000-8000-000000000002','Gestor','r1@example.test','hash','MANAGER','ACTIVE');
      INSERT INTO deposit_policies(id,version_number,status,rate_bps,minimum_amount_cents,effective_at,created_by)
      VALUES('30000000-0000-4000-8000-000000000003',1,'ACTIVE',5000,0,clock_timestamp(),'30000000-0000-4000-8000-000000000002');
      INSERT INTO asaas_connections(id,environment,status,api_key_ciphertext,api_key_nonce,api_key_auth_tag,
        webhook_token_ciphertext,webhook_token_nonce,webhook_token_auth_tag,webhook_public_url,key_fingerprint,created_by,updated_by)
      VALUES('30000000-0000-4000-8000-000000000004','SANDBOX','ACTIVE',decode('01','hex'),decode('02','hex'),decode('03','hex'),
        decode('04','hex'),decode('05','hex'),decode('06','hex'),'https://example.test/webhook','123456789012',
        '30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
      INSERT INTO audit_events(id,actor_type,actor_id,action,resource_type,resource_id,correlation_id)
      VALUES('30000000-0000-4000-8000-000000000005','USER','30000000-0000-4000-8000-000000000002','PRESERVED','connection','30000000-0000-4000-8000-000000000004','r1-check');
    `);
    const before =
      await client.query<PreservedState>(`SELECT (SELECT count(*) FROM deposit_policies)::int deposits,
      (SELECT count(*) FROM asaas_connections)::int connections,(SELECT count(*) FROM audit_events)::int audits`);
    await client.query(sql[4]!);
    const after =
      await client.query<UpgradedState>(`SELECT (SELECT count(*) FROM deposit_policies)::int deposits,
      (SELECT count(*) FROM asaas_connections)::int connections,(SELECT count(*) FROM audit_events)::int audits,
      (SELECT mode FROM deposit_policies)::text mode,(SELECT status FROM asaas_connections)::text connection_status`);
    const beforeState = before.rows[0];
    const afterState = after.rows[0];
    if (!beforeState || !afterState)
      throw new Error('A verificação de preservação não retornou estado do banco.');
    if (
      beforeState.deposits !== afterState.deposits ||
      beforeState.connections !== afterState.connections ||
      beforeState.audits !== afterState.audits
    )
      throw new Error('A migração corretiva removeu dados do Sprint 003.');
    if (afterState.mode !== 'PERCENTAGE' || afterState.connection_status !== 'CONNECTED')
      throw new Error('O mapeamento de compatibilidade do Sprint 003 falhou.');
    await client.query('BEGIN');
    await client.query(`INSERT INTO asaas_fee_snapshots(id,connection_id,environment,status,fetched_at,sanitized_payload,created_by)
      VALUES('30000000-0000-4000-8000-000000000099','30000000-0000-4000-8000-000000000004','SANDBOX','AVAILABLE',clock_timestamp(),'{}',
      '30000000-0000-4000-8000-000000000002')`);
    await client.query(`INSERT INTO payment_fee_policies(id,version_number,status,fee_snapshot_id,effective_at,created_by)
      VALUES('30000000-0000-4000-8000-000000000006',1,'ACTIVE','30000000-0000-4000-8000-000000000099',clock_timestamp(),'30000000-0000-4000-8000-000000000002')`);
    await client.query('ROLLBACK');
    const rollback = await client.query<{ count: number }>(
      `SELECT count(*)::int count FROM payment_fee_policies`,
    );
    if (rollback.rows[0]!.count !== 0)
      throw new Error('Rollback lógico não preservou o estado anterior.');
    process.stdout.write(
      `Cadeia desde banco vazio: PASSOU (${JSON.stringify(empty.rows[0])}).\nUpgrade Sprint 003 com dados: PASSOU (${JSON.stringify(afterState)}).\nRollback lógico: PASSOU.\n`,
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
