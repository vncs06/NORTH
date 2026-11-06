import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@north/database';
import { DomainError, sanitizeAuditData } from '@north/domain';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function commercialRequestHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export async function commercialAudit(
  client: DatabaseClient,
  input: {
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,correlation_id,before_data,after_data,metadata)
     VALUES($1,'USER',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [
      randomUUID(),
      input.actorId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      JSON.stringify(sanitizeAuditData(input.before) ?? null),
      JSON.stringify(sanitizeAuditData(input.after) ?? null),
      JSON.stringify(sanitizeAuditData(input.metadata) ?? {}),
    ],
  );
}

export function assertIdempotencyKey(value: string): void {
  if (!value || value.length > 200) {
    throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'Informe um Idempotency-Key válido.', 400);
  }
}

export async function lockIdempotency(
  client: DatabaseClient,
  input: { scope: string; key: string; payload: unknown },
): Promise<{ hash: string; replayResourceId: string | null }> {
  assertIdempotencyKey(input.key);
  const hash = commercialRequestHash(input.payload);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `${input.scope}|${input.key}`,
  ]);
  const result = await client.query<{ requestHash: string; resourceId: string }>(
    `SELECT request_hash AS "requestHash",resource_id AS "resourceId"
     FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2`,
    [input.scope, input.key],
  );
  const existing = result.rows[0];
  if (existing && existing.requestHash !== hash) {
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'A chave idempotente já foi usada com outro payload.',
      409,
    );
  }
  return { hash, replayResourceId: existing?.resourceId ?? null };
}

export async function recordIdempotency(
  client: DatabaseClient,
  input: {
    scope: string;
    key: string;
    hash: string;
    resourceType: string;
    resourceId: string;
    status?: number;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_records
       (id,scope,idempotency_key,request_hash,response_status,resource_type,resource_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      input.scope,
      input.key,
      input.hash,
      input.status ?? 200,
      input.resourceType,
      input.resourceId,
    ],
  );
}

export interface CursorData {
  value: string;
  id: string;
}

export function encodeCommercialCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCommercialCursor(cursor?: string): CursorData | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorData;
    if (!parsed.value || !parsed.id) throw new Error('invalid');
    return parsed;
  } catch {
    throw new DomainError('INVALID_CURSOR', 'Cursor de paginação inválido.', 400);
  }
}
