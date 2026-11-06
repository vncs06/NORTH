import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from './database-safety.js';

const policy = configuredTestDatabasePolicy();
const pool = new pg.Pool({ connectionString: policy.url, max: 1 });
const emptySchema = 'sprint002_empty_verify';
const upgradeSchema = 'sprint002_upgrade_verify';
const sprintOne = await readFile(
  new URL(
    '../../database/prisma/migrations/20261105120000_sprint_001/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const sprintTwo = await readFile(
  new URL(
    '../../database/prisma/migrations/20261105180000_sprint_002_catalog_quotes/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const sprintTwoDiscountOptions = await readFile(
  new URL(
    '../../database/prisma/migrations/20261105200000_sprint_002_discount_options/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

async function recreateSchema(client: pg.PoolClient, schema: string): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema},public`);
}

try {
  await verifyConnectedTestDatabase(pool, policy);
  const client = await pool.connect();
  try {
    await recreateSchema(client, emptySchema);
    await client.query(sprintOne);
    await client.query(sprintTwo);
    await client.query(sprintTwoDiscountOptions);
    const empty = await client.query<{
      sprintOne: string | null;
      sprintTwo: string | null;
      discountOptions: string | null;
    }>(
      `SELECT to_regclass('${emptySchema}.materials')::text AS "sprintOne",
              to_regclass('${emptySchema}.quotes')::text AS "sprintTwo",
              to_regclass('${emptySchema}.discount_policy_options')::text AS "discountOptions"`,
    );
    if (!empty.rows[0]?.sprintOne || !empty.rows[0]?.sprintTwo || !empty.rows[0]?.discountOptions) {
      throw new Error('Migração desde banco vazio não criou o schema completo.');
    }

    await recreateSchema(client, upgradeSchema);
    await client.query(sprintOne);
    await client.query(`
      INSERT INTO installation(singleton_key,id,company_name,timezone,currency)
      VALUES(true,'00000000-0000-4000-8000-000000000001','Empresa preservada','America/Manaus','BRL');
      INSERT INTO users(id,name,email_normalized,password_hash,role,status)
      VALUES('00000000-0000-4000-8000-000000000002','Gestor preservado','preservado@example.test','hash-seguro','MANAGER','ACTIVE');
      INSERT INTO materials(id,code,normalized_code,name,base_unit,status,created_by,updated_by)
      VALUES('00000000-0000-4000-8000-000000000003','LEGADO','LEGADO','Material preservado','un','ACTIVE',
             '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
      INSERT INTO inventory_balances(material_id,physical_quantity,reserved_quantity)
      VALUES('00000000-0000-4000-8000-000000000003',7,2);
      INSERT INTO inventory_movements(id,material_id,type,quantity_delta,idempotency_key,request_hash,
        correlation_id,resulting_physical,resulting_reserved,created_by)
      VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003',
        'OPENING_BALANCE',7,'legacy-key',repeat('a',64),'legacy-correlation',7,2,
        '00000000-0000-4000-8000-000000000002');
      INSERT INTO audit_events(id,actor_type,actor_id,action,resource_type,resource_id,correlation_id)
      VALUES('00000000-0000-4000-8000-000000000005','USER','00000000-0000-4000-8000-000000000002',
        'LEGACY_EVENT','material','00000000-0000-4000-8000-000000000003','legacy-correlation');
    `);
    const before = await client.query(
      `SELECT (SELECT count(*) FROM users)::int AS users,
              (SELECT count(*) FROM materials)::int AS materials,
              (SELECT count(*) FROM inventory_movements)::int AS movements,
              (SELECT count(*) FROM inventory_balances)::int AS balances,
              (SELECT count(*) FROM audit_events)::int AS audits,
              (SELECT physical_quantity::text FROM inventory_balances)::text AS physical,
              (SELECT reserved_quantity::text FROM inventory_balances)::text AS reserved`,
    );
    await client.query(sprintTwo);
    await client.query(sprintTwoDiscountOptions);
    const after = await client.query(
      `SELECT (SELECT count(*) FROM users)::int AS users,
              (SELECT count(*) FROM materials)::int AS materials,
              (SELECT count(*) FROM inventory_movements)::int AS movements,
              (SELECT count(*) FROM inventory_balances)::int AS balances,
              (SELECT count(*) FROM audit_events)::int AS audits,
              (SELECT physical_quantity::text FROM inventory_balances)::text AS physical,
              (SELECT reserved_quantity::text FROM inventory_balances)::text AS reserved,
              to_regclass('${upgradeSchema}.quotes')::text AS quotes`,
    );
    const beforeJson = JSON.stringify(before.rows[0]);
    const { quotes, ...preserved } = after.rows[0] as Record<string, unknown>;
    if (beforeJson !== JSON.stringify(preserved) || !quotes) {
      throw new Error(
        'A migração do Sprint 002 não preservou integralmente o estado do Sprint 001.',
      );
    }
    process.stdout.write(
      `Migração vazia: PASSOU (${empty.rows[0].sprintOne}, ${empty.rows[0].sprintTwo}, ${empty.rows[0].discountOptions}).\n` +
        `Migração sobre Sprint 001: PASSOU (${beforeJson}).\n`,
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
