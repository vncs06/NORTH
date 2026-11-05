import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CurrentActor, Page } from '@north/application';
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from '@north/auth';
import type { DatabaseClient } from '@north/database';
import { pool, transaction } from '@north/database';
import {
  addQuantities,
  assertMovementDelta,
  assertRole,
  calculateInventoryBalance,
  DomainError,
  enforceNegativeStockPolicy,
  normalizeEmail,
  normalizeMaterialCode,
  sanitizeAuditData,
  type MovementType,
  type Role,
} from '@north/domain';
import type { BootstrapInput } from './types.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  sessionVersion: number;
  createdAt: Date;
  disabledAt: Date | null;
}

interface SessionRow {
  id: string;
  csrfHash: string;
  userId: string;
  name: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  storedVersion: number;
  currentVersion: number;
}

interface BalanceRow {
  physical: string;
  reserved: string;
}

interface MovementRow {
  id: string;
  materialId: string;
  type: MovementType;
  quantityDelta: string;
  reason: string | null;
  sourceType: string | null;
  sourceId: string | null;
  correlationId: string;
  negativeStockConfirmed: boolean;
  resultingPhysical: string;
  resultingReserved: string;
  createdBy: string;
  createdAt: Date;
}

interface IdempotencyRow {
  requestHash: string;
  resourceId: string;
}

interface MaterialRow {
  id: string;
  code: string;
  normalizedCode: string;
  name: string;
  description: string | null;
  baseUnit: string;
  minimumStock: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  amountCents: string | null;
  physical: string;
  reserved: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CostRow {
  id: string;
  amountCents: string;
  effectiveAt: Date;
  reason: string | null;
  createdBy: string;
  createdAt: Date;
}

interface CursorData {
  value: string;
  id: string;
}

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

function requestHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(cursor?: string): CursorData | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorData;
    if (!parsed.value || !parsed.id) throw new Error('invalid');
    return parsed;
  } catch {
    throw new DomainError('INVALID_CURSOR', 'Cursor de paginação inválido.', 400);
  }
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    disabledAt: row.disabledAt,
  };
}

const balanceResponse = calculateInventoryBalance;

function movementResponse(row: MovementRow) {
  return {
    id: row.id,
    materialId: row.materialId,
    type: row.type,
    quantityDelta: row.quantityDelta,
    reason: row.reason,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    correlationId: row.correlationId,
    negativeStockConfirmed: row.negativeStockConfirmed,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    balance: balanceResponse(row.resultingPhysical, row.resultingReserved),
  };
}

function materialResponse(row: MaterialRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    baseUnit: row.baseUnit,
    minimumStock: row.minimumStock,
    status: row.status,
    version: row.version,
    currentCostCents: row.amountCents,
    balance: balanceResponse(row.physical, row.reserved),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function audit(
  client: DatabaseClient,
  input: {
    actorType?: 'USER' | 'SYSTEM' | 'NORTH_ADMIN';
    actorId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    correlationId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (id, actor_type, actor_id, action, resource_type, resource_id, correlation_id, before_data, after_data, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,
    [
      randomUUID(),
      input.actorType ?? 'USER',
      input.actorId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.correlationId,
      JSON.stringify(sanitizeAuditData(input.before) ?? null),
      JSON.stringify(sanitizeAuditData(input.after) ?? null),
      JSON.stringify(sanitizeAuditData(input.metadata) ?? {}),
    ],
  );
}

@Injectable()
export class NorthRepository {
  private readonly loginAttempts = new Map<string, { count: number; resetAt: number }>();

  async bootstrap(input: BootstrapInput, correlationId = randomUUID()) {
    const email = normalizeEmail(input.managerEmail);
    const passwordHash = await hashPassword(input.managerPassword);
    return transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('north-bootstrap', 0))");
      const existing = await client.query<{
        id: string;
        companyName: string;
        timezone: string;
        currency: string;
        managerEmail: string;
      }>(
        `SELECT i.id, i.company_name AS "companyName", i.timezone, i.currency,
                (SELECT email_normalized FROM users WHERE role='MANAGER' ORDER BY created_at LIMIT 1) AS "managerEmail"
         FROM installation i WHERE singleton_key=true`,
      );
      if (existing.rowCount) {
        const current = existing.rows[0]!;
        if (
          current.companyName === input.companyName.trim() &&
          current.timezone === input.timezone &&
          current.managerEmail === email
        ) {
          return { installationId: current.id, repeated: true };
        }
        throw new DomainError(
          'INSTALLATION_ALREADY_PROVISIONED',
          'Esta instalação já pertence a outra configuração de empresa.',
          409,
        );
      }
      const installationId = randomUUID();
      const managerId = randomUUID();
      await client.query(
        `INSERT INTO installation(singleton_key,id,company_name,timezone,currency)
         VALUES(true,$1,$2,$3,'BRL')`,
        [installationId, input.companyName.trim(), input.timezone],
      );
      await client.query(
        `INSERT INTO users(id,name,email_normalized,password_hash,role,status)
         VALUES($1,$2,$3,$4,'MANAGER','ACTIVE')`,
        [managerId, input.managerName.trim(), email, passwordHash],
      );
      await audit(client, {
        actorType: 'SYSTEM',
        action: 'INSTALLATION_BOOTSTRAPPED',
        resourceType: 'installation',
        resourceId: installationId,
        correlationId,
        after: { companyName: input.companyName.trim(), timezone: input.timezone, currency: 'BRL' },
        metadata: { managerId },
      });
      return { installationId, managerId, repeated: false };
    }, 'SERIALIZABLE');
  }

  private rateLimitKey(email: string, ip: string): string {
    return createHash('sha256').update(`${email}|${ip}`).digest('hex');
  }

  async login(emailInput: string, password: string, ip: string, correlationId: string) {
    const email = normalizeEmail(emailInput);
    const key = this.rateLimitKey(email, ip);
    const now = Date.now();
    const max = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5);
    const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 60_000);
    const attempts = this.loginAttempts.get(key);
    if (attempts && attempts.resetAt > now && attempts.count >= max) {
      throw new DomainError('LOGIN_RATE_LIMITED', 'Tente novamente mais tarde.', 429);
    }
    const result = await pool.query<UserRow>(
      `SELECT id,name,email_normalized AS email,password_hash AS "passwordHash",role,status,
              session_version AS "sessionVersion",created_at AS "createdAt",disabled_at AS "disabledAt"
       FROM users WHERE email_normalized=$1`,
      [email],
    );
    const user = result.rows[0];
    const valid = user?.status === 'ACTIVE' && (await verifyPassword(user.passwordHash, password));
    if (!valid || !user) {
      const current =
        attempts && attempts.resetAt > now ? attempts : { count: 0, resetAt: now + windowMs };
      current.count += 1;
      this.loginAttempts.set(key, current);
      await transaction((client) =>
        audit(client, {
          actorType: 'SYSTEM',
          action: 'LOGIN_FAILED',
          resourceType: 'session',
          correlationId,
          metadata: { reason: 'INVALID_CREDENTIALS' },
        }),
      );
      throw new DomainError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
    }
    this.loginAttempts.delete(key);
    const token = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const sessionId = randomUUID();
    const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO sessions(id,token_hash,csrf_hash,user_id,session_version,expires_at)
         VALUES($1,$2,$3,$4,$5,clock_timestamp()+($6 || ' hours')::interval)`,
        [sessionId, hashToken(token), hashToken(csrfToken), user.id, user.sessionVersion, ttlHours],
      );
      await audit(client, {
        actorId: user.id,
        action: 'LOGIN_SUCCEEDED',
        resourceType: 'session',
        resourceId: sessionId,
        correlationId,
      });
    });
    return { token, csrfToken, user: publicUser(user) };
  }

  async authenticate(token?: string): Promise<{ actor: CurrentActor; csrfHash: string } | null> {
    if (!token) return null;
    const result = await pool.query<SessionRow>(
      `SELECT s.id,s.csrf_hash AS "csrfHash",u.id AS "userId",u.name,u.role,u.status,
              s.session_version AS "storedVersion",u.session_version AS "currentVersion"
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()`,
      [hashToken(token)],
    );
    const session = result.rows[0];
    if (
      !session ||
      session.status !== 'ACTIVE' ||
      session.storedVersion !== session.currentVersion
    ) {
      return null;
    }
    void pool.query('UPDATE sessions SET last_seen_at=clock_timestamp() WHERE id=$1', [session.id]);
    return {
      actor: { id: session.userId, name: session.name, role: session.role, sessionId: session.id },
      csrfHash: session.csrfHash,
    };
  }

  async logout(actor: CurrentActor, correlationId: string): Promise<void> {
    await transaction(async (client) => {
      await client.query(
        'UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',
        [actor.sessionId],
      );
      await audit(client, {
        actorId: actor.id,
        action: 'LOGOUT',
        resourceType: 'session',
        resourceId: actor.sessionId,
        correlationId,
      });
    });
  }

  async listUsers(actor: CurrentActor) {
    assertRole(actor.role, ['MANAGER']);
    const result = await pool.query<UserRow>(
      `SELECT id,name,email_normalized AS email,password_hash AS "passwordHash",role,status,
              session_version AS "sessionVersion",created_at AS "createdAt",disabled_at AS "disabledAt"
       FROM users ORDER BY created_at,id`,
    );
    return result.rows.map(publicUser);
  }

  async createEmployee(
    actor: CurrentActor,
    input: { name: string; email: string; password: string },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    try {
      return await transaction(async (client) => {
        const result = await client.query<UserRow>(
          `INSERT INTO users(id,name,email_normalized,password_hash,role,status,created_by)
           VALUES($1,$2,$3,$4,'EMPLOYEE','ACTIVE',$5)
           RETURNING id,name,email_normalized AS email,password_hash AS "passwordHash",role,status,
                     session_version AS "sessionVersion",created_at AS "createdAt",disabled_at AS "disabledAt"`,
          [id, input.name.trim(), normalizeEmail(input.email), passwordHash, actor.id],
        );
        const user = result.rows[0]!;
        await audit(client, {
          actorId: actor.id,
          action: 'EMPLOYEE_CREATED',
          resourceType: 'user',
          resourceId: id,
          correlationId,
          after: publicUser(user),
        });
        return publicUser(user);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new DomainError('EMAIL_ALREADY_EXISTS', 'Já existe usuário com este e-mail.', 409);
      }
      throw error;
    }
  }

  async disableUser(actor: CurrentActor, id: string, correlationId: string) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const locked = await client.query<UserRow>(
        `SELECT id,name,email_normalized AS email,password_hash AS "passwordHash",role,status,
                session_version AS "sessionVersion",created_at AS "createdAt",disabled_at AS "disabledAt"
         FROM users WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const target = locked.rows[0];
      if (!target) throw new DomainError('USER_NOT_FOUND', 'Usuário não encontrado.', 404);
      if (target.role === 'MANAGER') {
        const managers = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM users WHERE role='MANAGER' AND status='ACTIVE'",
        );
        if (Number(managers.rows[0]!.count) <= 1) {
          throw new DomainError(
            'LAST_MANAGER_CANNOT_BE_DISABLED',
            'O último gestor ativo não pode ser desativado.',
            409,
          );
        }
      }
      if (target.status === 'DISABLED') return publicUser(target);
      const updated = await client.query<UserRow>(
        `UPDATE users SET status='DISABLED',disabled_by=$2,disabled_at=clock_timestamp(),
                session_version=session_version+1,updated_at=clock_timestamp()
         WHERE id=$1
         RETURNING id,name,email_normalized AS email,password_hash AS "passwordHash",role,status,
                   session_version AS "sessionVersion",created_at AS "createdAt",disabled_at AS "disabledAt"`,
        [id, actor.id],
      );
      await client.query(
        'UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL',
        [id],
      );
      await audit(client, {
        actorId: actor.id,
        action: 'USER_DISABLED',
        resourceType: 'user',
        resourceId: id,
        correlationId,
        before: publicUser(target),
        after: publicUser(updated.rows[0]!),
      });
      return publicUser(updated.rows[0]!);
    });
  }

  private materialSelect() {
    return `SELECT m.id,m.code,m.normalized_code AS "normalizedCode",m.name,m.description,
                   m.base_unit AS "baseUnit",m.minimum_stock::text AS "minimumStock",m.status,m.version,
                   c.amount_cents::text AS "amountCents",b.physical_quantity::text AS physical,
                   b.reserved_quantity::text AS reserved,m.created_at AS "createdAt",m.updated_at AS "updatedAt"
            FROM materials m
            JOIN inventory_balances b ON b.material_id=m.id
            LEFT JOIN LATERAL (
              SELECT amount_cents FROM material_costs
              WHERE material_id=m.id AND effective_at<=clock_timestamp()
              ORDER BY effective_at DESC,created_at DESC,id DESC LIMIT 1
            ) c ON true`;
  }

  async listMaterials(input: {
    search?: string;
    status?: string;
    cursor?: string;
  }): Promise<Page<unknown>> {
    const cursor = decodeCursor(input.cursor);
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.search?.trim()) {
      values.push(`%${input.search.trim()}%`);
      where.push(`(m.normalized_code ILIKE $${values.length} OR m.name ILIKE $${values.length})`);
    }
    if (input.status) {
      values.push(input.status);
      where.push(`m.status=$${values.length}`);
    }
    if (cursor) {
      values.push(cursor.value, cursor.id);
      where.push(`(m.normalized_code,m.id)>($${values.length - 1},$${values.length}::uuid)`);
    }
    values.push(21);
    const result = await pool.query<MaterialRow>(
      `${this.materialSelect()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY m.normalized_code,m.id LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 20;
    const items = result.rows.slice(0, 20);
    const last = items.at(-1);
    return {
      items: items.map(materialResponse),
      nextCursor:
        hasMore && last ? encodeCursor({ value: last.normalizedCode, id: last.id }) : null,
    };
  }

  async getMaterial(id: string) {
    const result = await pool.query<MaterialRow>(`${this.materialSelect()} WHERE m.id=$1`, [id]);
    const row = result.rows[0];
    if (!row) throw new DomainError('MATERIAL_NOT_FOUND', 'Material não encontrado.', 404);
    return materialResponse(row);
  }

  async createMaterial(
    actor: CurrentActor,
    input: {
      code: string;
      name: string;
      description?: string;
      baseUnit: string;
      minimumStock: string;
    },
    correlationId: string,
  ) {
    const id = randomUUID();
    try {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO materials
             (id,code,normalized_code,name,description,base_unit,minimum_stock,status,created_by,updated_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$8)`,
          [
            id,
            input.code.trim(),
            normalizeMaterialCode(input.code),
            input.name.trim(),
            input.description?.trim() || null,
            input.baseUnit,
            input.minimumStock,
            actor.id,
          ],
        );
        await client.query('INSERT INTO inventory_balances(material_id) VALUES($1)', [id]);
        await audit(client, {
          actorId: actor.id,
          action: 'MATERIAL_CREATED',
          resourceType: 'material',
          resourceId: id,
          correlationId,
          after: { ...input, status: 'ACTIVE' },
        });
      });
      return this.getMaterial(id);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new DomainError(
          'MATERIAL_CODE_ALREADY_EXISTS',
          'Código de material já utilizado.',
          409,
        );
      }
      throw error;
    }
  }

  async updateMaterial(
    actor: CurrentActor,
    id: string,
    input: {
      version: number;
      code?: string;
      name?: string;
      description?: string;
      baseUnit?: string;
      minimumStock?: string;
      status?: 'ACTIVE' | 'INACTIVE';
    },
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const currentResult = await client.query<MaterialRow>(
        `${this.materialSelect()} WHERE m.id=$1 FOR UPDATE OF m`,
        [id],
      );
      const current = currentResult.rows[0];
      if (!current) throw new DomainError('MATERIAL_NOT_FOUND', 'Material não encontrado.', 404);
      if (current.version !== input.version) {
        throw new DomainError(
          'MATERIAL_VERSION_CONFLICT',
          'O material foi alterado por outra sessão.',
          409,
        );
      }
      const code = input.code?.trim() ?? current.code;
      await client.query(
        `UPDATE materials SET code=$2,normalized_code=$3,name=$4,description=$5,base_unit=$6,
                minimum_stock=$7,status=$8,version=version+1,updated_by=$9,updated_at=clock_timestamp()
         WHERE id=$1`,
        [
          id,
          code,
          normalizeMaterialCode(code),
          input.name?.trim() ?? current.name,
          input.description === undefined ? current.description : input.description.trim() || null,
          input.baseUnit ?? current.baseUnit,
          input.minimumStock ?? current.minimumStock,
          input.status ?? current.status,
          actor.id,
        ],
      );
      await audit(client, {
        actorId: actor.id,
        action: 'MATERIAL_UPDATED',
        resourceType: 'material',
        resourceId: id,
        correlationId,
        before: materialResponse(current),
        after: input,
      });
      return { id, version: current.version + 1 };
    });
  }

  async listCosts(id: string) {
    await this.getMaterial(id);
    const result = await pool.query<CostRow>(
      `SELECT id,amount_cents::text AS "amountCents",effective_at AS "effectiveAt",reason,
              created_by AS "createdBy",created_at AS "createdAt"
       FROM material_costs WHERE material_id=$1 ORDER BY effective_at DESC,created_at DESC,id DESC`,
      [id],
    );
    return result.rows;
  }

  async createCost(
    actor: CurrentActor,
    materialId: string,
    input: { amountCents: number; effectiveAt: string; reason?: string },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    const id = randomUUID();
    return transaction(async (client) => {
      const material = await client.query('SELECT id FROM materials WHERE id=$1', [materialId]);
      if (!material.rowCount)
        throw new DomainError('MATERIAL_NOT_FOUND', 'Material não encontrado.', 404);
      const previous = await client.query<{ amountCents: string }>(
        `SELECT amount_cents::text AS "amountCents" FROM material_costs
         WHERE material_id=$1 AND effective_at<=clock_timestamp()
         ORDER BY effective_at DESC,created_at DESC,id DESC LIMIT 1`,
        [materialId],
      );
      const created = await client.query<CostRow>(
        `INSERT INTO material_costs(id,material_id,amount_cents,effective_at,reason,created_by)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id,amount_cents::text AS "amountCents",effective_at AS "effectiveAt",reason,
                   created_by AS "createdBy",created_at AS "createdAt"`,
        [id, materialId, input.amountCents, input.effectiveAt, input.reason ?? null, actor.id],
      );
      await audit(client, {
        actorId: actor.id,
        action: 'MATERIAL_COST_CREATED',
        resourceType: 'material_cost',
        resourceId: id,
        correlationId,
        before: previous.rows[0] ?? null,
        after: created.rows[0],
        metadata: { materialId },
      });
      return created.rows[0];
    });
  }

  async getBalance(materialId: string) {
    const result = await pool.query<BalanceRow>(
      `SELECT physical_quantity::text AS physical,reserved_quantity::text AS reserved
       FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('MATERIAL_NOT_FOUND', 'Material não encontrado.', 404);
    return balanceResponse(row.physical, row.reserved);
  }

  async listMovements(materialId: string, cursorInput?: string): Promise<Page<unknown>> {
    const cursor = decodeCursor(cursorInput);
    const values: unknown[] = [materialId];
    let cursorSql = '';
    if (cursor) {
      values.push(cursor.value, cursor.id);
      cursorSql = `AND (created_at,id)<($2::timestamptz,$3::uuid)`;
    }
    values.push(21);
    const result = await pool.query<MovementRow>(
      `SELECT id,material_id AS "materialId",type,quantity_delta::text AS "quantityDelta",reason,
              source_type AS "sourceType",source_id AS "sourceId",correlation_id AS "correlationId",
              negative_stock_confirmed AS "negativeStockConfirmed",
              resulting_physical::text AS "resultingPhysical",resulting_reserved::text AS "resultingReserved",
              created_by AS "createdBy",created_at AS "createdAt"
       FROM inventory_movements WHERE material_id=$1 ${cursorSql}
       ORDER BY created_at DESC,id DESC LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 20;
    const rows = result.rows.slice(0, 20);
    const last = rows.at(-1);
    return {
      items: rows.map(movementResponse),
      nextCursor:
        hasMore && last ? encodeCursor({ value: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async createMovement(
    actor: CurrentActor,
    materialId: string,
    input: {
      type: MovementType;
      quantity: string;
      reason?: string;
      confirmNegative: boolean;
    },
    idempotencyKey: string,
    correlationId: string,
    source?: { type: string; id: string },
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'Informe um Idempotency-Key válido.', 400);
    }
    if (
      (input.type === 'ADJUSTMENT_IN' || input.type === 'ADJUSTMENT_OUT') &&
      !input.reason?.trim()
    ) {
      throw new DomainError('ADJUSTMENT_REASON_REQUIRED', 'Ajuste exige motivo.', 422);
    }
    const scope = source
      ? `POST:/materials/${materialId}/movements/${source.id}/compensations`
      : `POST:/materials/${materialId}/movements`;
    const hash = requestHash({ materialId, ...input, source });
    return transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${scope}|${idempotencyKey}`,
      ]);
      const idempotency = await client.query<IdempotencyRow>(
        `SELECT request_hash AS "requestHash",resource_id AS "resourceId"
         FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2`,
        [scope, idempotencyKey],
      );
      const replay = idempotency.rows[0];
      if (replay) {
        if (replay.requestHash !== hash) {
          throw new DomainError(
            'IDEMPOTENCY_KEY_REUSED',
            'A chave idempotente já foi usada com outro payload.',
            409,
          );
        }
        const original = await this.findMovement(client, replay.resourceId);
        return { ...movementResponse(original), idempotentReplay: true };
      }
      const material = await client.query<{ status: 'ACTIVE' | 'INACTIVE' }>(
        'SELECT status FROM materials WHERE id=$1',
        [materialId],
      );
      if (!material.rowCount)
        throw new DomainError('MATERIAL_NOT_FOUND', 'Material não encontrado.', 404);
      if (material.rows[0]!.status !== 'ACTIVE') {
        throw new DomainError(
          'MATERIAL_INACTIVE',
          'Reative o material antes de movimentá-lo.',
          422,
        );
      }
      if (source) {
        const original = await client.query<MovementRow>(
          `SELECT id,material_id AS "materialId",type,quantity_delta::text AS "quantityDelta",reason,
                  source_type AS "sourceType",source_id AS "sourceId",correlation_id AS "correlationId",
                  negative_stock_confirmed AS "negativeStockConfirmed",resulting_physical::text AS "resultingPhysical",
                  resulting_reserved::text AS "resultingReserved",created_by AS "createdBy",created_at AS "createdAt"
           FROM inventory_movements WHERE id=$1 AND material_id=$2`,
          [source.id, materialId],
        );
        if (!original.rowCount)
          throw new DomainError('MOVEMENT_NOT_FOUND', 'Movimento não encontrado.', 404);
      }
      const balance = await client.query<BalanceRow>(
        `SELECT physical_quantity::text AS physical,reserved_quantity::text AS reserved
         FROM inventory_balances WHERE material_id=$1 FOR UPDATE`,
        [materialId],
      );
      const current = balance.rows[0]!;
      const delta = assertMovementDelta(input.type, input.quantity);
      const nextPhysical = addQuantities(current.physical, delta);
      enforceNegativeStockPolicy({
        resultingPhysical: nextPhysical,
        role: actor.role,
        confirmNegative: input.confirmNegative,
        reason: input.reason,
      });
      const movementId = randomUUID();
      const inserted = await client.query<MovementRow>(
        `INSERT INTO inventory_movements
           (id,material_id,type,quantity_delta,reason,source_type,source_id,idempotency_key,request_hash,
            correlation_id,negative_stock_confirmed,resulting_physical,resulting_reserved,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id,material_id AS "materialId",type,quantity_delta::text AS "quantityDelta",reason,
                   source_type AS "sourceType",source_id AS "sourceId",correlation_id AS "correlationId",
                   negative_stock_confirmed AS "negativeStockConfirmed",resulting_physical::text AS "resultingPhysical",
                   resulting_reserved::text AS "resultingReserved",created_by AS "createdBy",created_at AS "createdAt"`,
        [
          movementId,
          materialId,
          input.type,
          delta,
          input.reason?.trim() || null,
          source?.type ?? null,
          source?.id ?? null,
          idempotencyKey,
          hash,
          correlationId,
          nextPhysical.startsWith('-') && actor.role === 'MANAGER' && input.confirmNegative,
          nextPhysical,
          current.reserved,
          actor.id,
        ],
      );
      await client.query(
        `UPDATE inventory_balances SET physical_quantity=$2,version=version+1,updated_at=clock_timestamp()
         WHERE material_id=$1`,
        [materialId, nextPhysical],
      );
      await client.query(
        `INSERT INTO idempotency_records
           (id,scope,idempotency_key,request_hash,response_status,resource_type,resource_id)
         VALUES($1,$2,$3,$4,201,'inventory_movement',$5)`,
        [randomUUID(), scope, idempotencyKey, hash, movementId],
      );
      await audit(client, {
        actorId: actor.id,
        action: source ? 'INVENTORY_COMPENSATION_CREATED' : 'INVENTORY_MOVEMENT_CREATED',
        resourceType: 'inventory_movement',
        resourceId: movementId,
        correlationId,
        before: { balance: balanceResponse(current.physical, current.reserved) },
        after: movementResponse(inserted.rows[0]!),
        metadata: { negativeException: nextPhysical.startsWith('-') },
      });
      return { ...movementResponse(inserted.rows[0]!), idempotentReplay: false };
    });
  }

  private async findMovement(client: DatabaseClient, id: string): Promise<MovementRow> {
    const result = await client.query<MovementRow>(
      `SELECT id,material_id AS "materialId",type,quantity_delta::text AS "quantityDelta",reason,
              source_type AS "sourceType",source_id AS "sourceId",correlation_id AS "correlationId",
              negative_stock_confirmed AS "negativeStockConfirmed",resulting_physical::text AS "resultingPhysical",
              resulting_reserved::text AS "resultingReserved",created_by AS "createdBy",created_at AS "createdAt"
       FROM inventory_movements WHERE id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('MOVEMENT_NOT_FOUND', 'Movimento não encontrado.', 404);
    return row;
  }

  async compensateMovement(
    actor: CurrentActor,
    materialId: string,
    movementId: string,
    input: { quantity?: string; reason: string; confirmNegative: boolean },
    idempotencyKey: string,
    correlationId: string,
  ) {
    const originalResult = await pool.query<{ quantityDelta: string }>(
      `SELECT quantity_delta::text AS "quantityDelta" FROM inventory_movements WHERE id=$1 AND material_id=$2`,
      [movementId, materialId],
    );
    const original = originalResult.rows[0];
    if (!original) throw new DomainError('MOVEMENT_NOT_FOUND', 'Movimento não encontrado.', 404);
    const inverse =
      input.quantity ??
      addQuantities(
        '0',
        original.quantityDelta.startsWith('-')
          ? original.quantityDelta.slice(1)
          : `-${original.quantityDelta}`,
      );
    const type: MovementType = inverse.startsWith('-') ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN';
    return this.createMovement(
      actor,
      materialId,
      { type, quantity: inverse, reason: input.reason, confirmNegative: input.confirmNegative },
      idempotencyKey,
      correlationId,
      { type: 'INVENTORY_MOVEMENT', id: movementId },
    );
  }

  async listAudit(input: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }): Promise<Page<unknown>> {
    const cursor = decodeCursor(input.cursor);
    const values: unknown[] = [];
    const where: string[] = [];
    for (const [column, value, cast] of [
      ['resource_type', input.resourceType, ''],
      ['resource_id', input.resourceId, '::uuid'],
      ['actor_id', input.actorId, '::uuid'],
    ] as const) {
      if (value) {
        values.push(value);
        where.push(`${column}=$${values.length}${cast}`);
      }
    }
    if (input.from) {
      values.push(input.from);
      where.push(`occurred_at>=$${values.length}::timestamptz`);
    }
    if (input.to) {
      values.push(input.to);
      where.push(`occurred_at<=$${values.length}::timestamptz`);
    }
    if (cursor) {
      values.push(cursor.value, cursor.id);
      where.push(`(occurred_at,id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    }
    values.push(51);
    const result = await pool.query<{
      id: string;
      occurredAt: Date;
      actorType: string;
      actorId: string | null;
      action: string;
      resourceType: string;
      resourceId: string | null;
      correlationId: string;
      beforeData: unknown;
      afterData: unknown;
      metadata: unknown;
    }>(
      `SELECT id,occurred_at AS "occurredAt",actor_type AS "actorType",actor_id AS "actorId",action,
              resource_type AS "resourceType",resource_id AS "resourceId",correlation_id AS "correlationId",
              before_data AS "beforeData",after_data AS "afterData",metadata
       FROM audit_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY occurred_at DESC,id DESC LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 50;
    const items = result.rows.slice(0, 50);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ value: last.occurredAt.toISOString(), id: last.id })
          : null,
    };
  }
}
