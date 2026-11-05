import pg from 'pg';

const { Pool } = pg;

export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://north:north_dev_only@localhost:5432/north';

export const pool = new Pool({
  connectionString: databaseUrl,
  max: process.env.NODE_ENV === 'test' ? 20 : 10,
  application_name: 'north-erp',
});

export type DatabaseClient = pg.PoolClient;

export async function transaction<T>(
  operation: (client: DatabaseClient) => Promise<T>,
  isolation: 'READ COMMITTED' | 'SERIALIZABLE' = 'READ COMMITTED',
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
