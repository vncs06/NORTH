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
  const attempts = isolation === 'SERIALIZABLE' ? 4 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const retryable = (error as { code?: string }).code === '40001';
      if (!retryable || attempt === attempts) throw error;
    } finally {
      client.release();
    }
  }
  throw new Error('SERIALIZABLE_TRANSACTION_RETRY_EXHAUSTED');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
