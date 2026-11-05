import type { Pool } from 'pg';

const TEST_DATABASE_ALLOWLIST = new Set(['north_test']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface TestDatabasePolicy {
  database: string;
  url: string;
}

interface TestDatabaseEnvironment {
  nodeEnv?: string;
  testDatabaseUrl?: string;
  developmentDatabaseUrl?: string;
}

function parseDatabaseUrl(value: string, variable: string): URL {
  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('protocol');
    return parsed;
  } catch {
    throw new Error(`Configuração de teste recusada: ${variable} não é uma URL PostgreSQL válida.`);
  }
}

function normalizedHost(hostname: string): string {
  const unwrapped = hostname.replace(/^\[|\]$/g, '').toLocaleLowerCase('en-US');
  return LOCAL_HOSTS.has(unwrapped) ? 'loopback' : unwrapped;
}

function databaseName(url: URL): string {
  const encoded = url.pathname.replace(/^\/+/, '');
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new Error('Banco de teste recusado: nome de banco inválido.');
  }
}

function databaseIdentity(url: URL): string {
  return `${normalizedHost(url.hostname)}:${url.port || '5432'}/${databaseName(url)}`;
}

export function validateTestDatabaseEnvironment(
  environment: TestDatabaseEnvironment,
): TestDatabasePolicy {
  if (environment.nodeEnv !== 'test') {
    throw new Error('Reset recusado: NODE_ENV deve ser test.');
  }
  if (!environment.testDatabaseUrl) {
    throw new Error('Configuração de teste recusada: TEST_DATABASE_URL ausente.');
  }

  const testUrl = parseDatabaseUrl(environment.testDatabaseUrl, 'TEST_DATABASE_URL');
  const host = testUrl.hostname.replace(/^\[|\]$/g, '').toLocaleLowerCase('en-US');
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error('Banco de teste recusado: o host deve ser local.');
  }

  const database = databaseName(testUrl);
  if (database === 'north') {
    throw new Error('Banco de teste recusado: o banco principal north nunca é permitido.');
  }
  if (!TEST_DATABASE_ALLOWLIST.has(database)) {
    throw new Error('Banco de teste recusado: use exclusivamente o banco north_test.');
  }

  if (environment.developmentDatabaseUrl) {
    const developmentUrl = parseDatabaseUrl(environment.developmentDatabaseUrl, 'DATABASE_URL');
    if (databaseIdentity(testUrl) === databaseIdentity(developmentUrl)) {
      throw new Error(
        'Banco de teste recusado: TEST_DATABASE_URL aponta para o mesmo banco de DATABASE_URL.',
      );
    }
  }

  return { database, url: environment.testDatabaseUrl };
}

export function configuredTestDatabasePolicy(): TestDatabasePolicy {
  return validateTestDatabaseEnvironment({
    nodeEnv: process.env.NODE_ENV,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    developmentDatabaseUrl: process.env.DEVELOPMENT_DATABASE_URL ?? process.env.DATABASE_URL,
  });
}

export function assertConnectedTestDatabase(
  policy: TestDatabasePolicy,
  connectedDatabase: string,
): void {
  if (
    connectedDatabase !== policy.database ||
    connectedDatabase === 'north' ||
    !TEST_DATABASE_ALLOWLIST.has(connectedDatabase)
  ) {
    throw new Error(
      'Banco conectado recusado: current_database() não corresponde ao banco de teste permitido.',
    );
  }
}

export async function verifyConnectedTestDatabase(
  pool: Pick<Pool, 'query'>,
  policy: TestDatabasePolicy,
): Promise<string> {
  const result = await pool.query<{ database: string }>('SELECT current_database() AS database');
  const connectedDatabase = result.rows[0]?.database ?? '';
  assertConnectedTestDatabase(policy, connectedDatabase);
  return connectedDatabase;
}

export function maintenanceDatabaseUrl(policy: TestDatabasePolicy): string {
  const url = new URL(policy.url);
  url.pathname = '/postgres';
  url.search = '';
  url.hash = '';
  return url.toString();
}
