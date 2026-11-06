import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });
const migrations = await Promise.all(
  [
    '20261105120000_sprint_001',
    '20261105180000_sprint_002_catalog_quotes',
    '20261105200000_sprint_002_discount_options',
    '20261106120000_sprint_003_orders_art_payments_reservations',
  ].map((name) =>
    readFile(
      new URL(`../../database/prisma/migrations/${name}/migration.sql`, import.meta.url),
      'utf8',
    ),
  ),
);
const [sprintOne, sprintTwo, discountOptions, sprintThree] = migrations as [
  string,
  string,
  string,
  string,
];
const emptySchema = 'sprint003_empty_verify';
const upgradeSchema = 'sprint003_upgrade_verify';

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
    for (const sql of migrations) await client.query(sql);
    const empty = await client.query(`SELECT to_regclass('${emptySchema}.orders')::text AS orders,
      to_regclass('${emptySchema}.payment_charges')::text AS charges,
      to_regclass('${emptySchema}.artwork_versions')::text AS artworks,
      to_regclass('${emptySchema}.inventory_reservations')::text AS reservations`);
    if (Object.values(empty.rows[0] as Record<string, unknown>).some((value) => !value)) {
      throw new Error('Migração desde banco vazio não criou o modelo completo do Sprint 003.');
    }

    await recreate(client, upgradeSchema);
    await client.query(sprintOne);
    await client.query(sprintTwo);
    await client.query(discountOptions);
    await client.query(`
      INSERT INTO installation(singleton_key,id,company_name,timezone,currency)
      VALUES(true,'10000000-0000-4000-8000-000000000001','Empresa preservada','America/Manaus','BRL');
      INSERT INTO users(id,name,email_normalized,password_hash,role,status)
      VALUES('10000000-0000-4000-8000-000000000002','Gestor','s3@example.test','hash','MANAGER','ACTIVE');
      INSERT INTO materials(id,code,normalized_code,name,base_unit,status,created_by,updated_by)
      VALUES('10000000-0000-4000-8000-000000000003','M-S3','M-S3','Material','un','ACTIVE',
        '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
      INSERT INTO inventory_balances(material_id,physical_quantity,reserved_quantity)
      VALUES('10000000-0000-4000-8000-000000000003',12,2);
      INSERT INTO customers(id,type,display_name,normalized_display_name,status,created_by,updated_by)
      VALUES('10000000-0000-4000-8000-000000000004','PERSON','Cliente','cliente','ACTIVE',
        '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
      INSERT INTO quotes(id,commercial_number,revision_number,root_quote_id,customer_id,status,
        final_price_cents,customer_display_name_snapshot,created_by,updated_by,issued_by,issued_at)
      VALUES('10000000-0000-4000-8000-000000000005','ORC-PRESERVADO',1,
        '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','ISSUED',
        10000,'Cliente','10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',clock_timestamp());
      INSERT INTO audit_events(id,actor_type,actor_id,action,resource_type,resource_id,correlation_id)
      VALUES('10000000-0000-4000-8000-000000000006','USER','10000000-0000-4000-8000-000000000002',
        'PRESERVED','quote','10000000-0000-4000-8000-000000000005','migration-check');
    `);
    const before = await client.query(`SELECT
      (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM materials)::int materials,
      (SELECT count(*) FROM inventory_balances)::int balances,(SELECT count(*) FROM customers)::int customers,
      (SELECT count(*) FROM quotes)::int quotes,(SELECT count(*) FROM audit_events)::int audits,
      (SELECT physical_quantity::text FROM inventory_balances)::text physical,
      (SELECT reserved_quantity::text FROM inventory_balances)::text reserved`);
    await client.query(sprintThree);
    const after = await client.query(`SELECT
      (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM materials)::int materials,
      (SELECT count(*) FROM inventory_balances)::int balances,(SELECT count(*) FROM customers)::int customers,
      (SELECT count(*) FROM quotes)::int quotes,(SELECT count(*) FROM audit_events)::int audits,
      (SELECT physical_quantity::text FROM inventory_balances)::text physical,
      (SELECT reserved_quantity::text FROM inventory_balances)::text reserved`);
    if (JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0])) {
      throw new Error('Migração do Sprint 003 alterou dados do Sprint 001/002.');
    }
    await client.query('BEGIN');
    await client.query(`INSERT INTO deposit_policies(id,version_number,status,rate_bps,effective_at,created_by)
      VALUES('10000000-0000-4000-8000-000000000010',1,'ACTIVE',5000,clock_timestamp(),
      '10000000-0000-4000-8000-000000000002')`);
    await client.query('ROLLBACK');
    const rolledBack = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM deposit_policies`,
    );
    if (rolledBack.rows[0]?.count !== 0)
      throw new Error('Rollback transacional da migração falhou.');
    process.stdout.write(
      `Migração vazia: PASSOU (${JSON.stringify(empty.rows[0])}).\n` +
        `Upgrade com dados Sprint 002: PASSOU (${JSON.stringify(after.rows[0])}).\n` +
        'Rollback transacional: PASSOU.\n',
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
