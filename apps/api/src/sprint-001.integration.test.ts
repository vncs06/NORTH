import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { pool } from '@north/database';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from '@north/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import request, { type Response, type SuperAgentTest } from 'supertest';
import { createApp } from './main.js';
import { NorthRepository } from './repository.js';

const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

interface LoginSession {
  agent: SuperAgentTest;
  csrf: string;
  userId: string;
}

function csrfFrom(response: Response): string {
  const cookies = response.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const raw = list.find((cookie) => cookie.startsWith('north_csrf='));
  if (!raw) throw new Error('Cookie CSRF não retornado');
  return decodeURIComponent(raw.split(';')[0]!.split('=')[1]!);
}

describe('Sprint 001 com PostgreSQL real', () => {
  let app: INestApplication;
  const repository = new NorthRepository();

  async function login(email: string, password: string): Promise<LoginSession> {
    const agent = request.agent(app.getHttpServer()) as unknown as SuperAgentTest;
    const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(201);
    return { agent, csrf: csrfFrom(response), userId: response.body.user.id as string };
  }

  function mutate(agent: SuperAgentTest, csrf: string, method: 'post' | 'patch', path: string) {
    return agent[method](path).set('origin', ORIGIN).set('x-csrf-token', csrf);
  }

  beforeAll(async () => {
    const policy = configuredTestDatabasePolicy();
    await expect(verifyConnectedTestDatabase(pool, policy)).resolves.toBe('north_test');
    await repository.bootstrap({
      companyName: 'Empresa de Integração',
      timezone: 'America/Manaus',
      managerName: 'Gestor Teste',
      managerEmail: 'gestor.integration@example.test',
      managerPassword: 'IntegrationPassword123!',
    });
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('impede segunda instalação e torna bootstrap idempotente', async () => {
    await expect(
      repository.bootstrap({
        companyName: 'Empresa de Integração',
        timezone: 'America/Manaus',
        managerName: 'Gestor Teste',
        managerEmail: 'gestor.integration@example.test',
        managerPassword: 'IntegrationPassword123!',
      }),
    ).resolves.toMatchObject({ repeated: true });

    await expect(
      repository.bootstrap({
        companyName: 'Outra Empresa',
        timezone: 'America/Manaus',
        managerName: 'Outro Gestor',
        managerEmail: 'outro@example.test',
        managerPassword: 'AnotherPassword123!',
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_ALREADY_PROVISIONED' });
  });

  it('recusa uma conexão real que resolve para o banco de desenvolvimento', async () => {
    const developmentUrl = process.env.DEVELOPMENT_DATABASE_URL;
    expect(developmentUrl).toBeTruthy();
    const developmentPool = new pg.Pool({ connectionString: developmentUrl, max: 1 });
    try {
      await expect(
        verifyConnectedTestDatabase(developmentPool, configuredTestDatabasePolicy()),
      ).rejects.toThrow('current_database() não corresponde ao banco de teste permitido');
    } finally {
      await developmentPool.end();
    }
  });

  it('limita tentativas de login sem revelar se o e-mail existe', async () => {
    const previousMax = process.env.LOGIN_RATE_LIMIT_MAX;
    process.env.LOGIN_RATE_LIMIT_MAX = '1';
    try {
      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'rate-limit@example.test', password: 'InvalidPassword123!' })
        .expect(401);
      const second = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'rate-limit@example.test', password: 'InvalidPassword123!' })
        .expect(429);
      expect(first.body.message).toBe('E-mail ou senha inválidos.');
      expect(second.body).toMatchObject({ code: 'LOGIN_RATE_LIMITED' });
    } finally {
      if (previousMax === undefined) delete process.env.LOGIN_RATE_LIMIT_MAX;
      else process.env.LOGIN_RATE_LIMIT_MAX = previousMax;
    }
  });

  it('aplica autenticação, papéis, CSRF e revogação imediata', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');

    const employeeResponse = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/users')
      .send({
        name: 'Funcionário Teste',
        email: 'employee@example.test',
        password: 'EmployeePassword123!',
      })
      .expect(201);
    const employeeId = employeeResponse.body.id as string;
    const employee = await login('employee@example.test', 'EmployeePassword123!');

    await employee.agent.get('/api/v1/users').expect(403);
    await employee.agent
      .post('/api/v1/materials')
      .send({ code: 'SEM-CSRF', name: 'Sem CSRF', baseUnit: 'un', minimumStock: '0' })
      .expect(403);

    await mutate(manager.agent, manager.csrf, 'patch', `/api/v1/users/${employeeId}/status`)
      .send({ status: 'DISABLED' })
      .expect(200);
    await employee.agent.get('/api/v1/auth/me').expect(401);
  });

  it('mantém custo gerencial, movimentos imutáveis e idempotência', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    const employeeResponse = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/users')
      .send({ name: 'Operador', email: 'operator@example.test', password: 'OperatorPassword123!' })
      .expect(201);
    expect(employeeResponse.body.role).toBe('EMPLOYEE');
    const employee = await login('operator@example.test', 'OperatorPassword123!');

    const material = await mutate(employee.agent, employee.csrf, 'post', '/api/v1/materials')
      .send({ code: ' mat 01 ', name: 'Material Teste', baseUnit: 'm', minimumStock: '1.5' })
      .expect(201);
    const materialId = material.body.id as string;
    expect(material.body.code).toBe('mat 01');

    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/materials/${materialId}/costs`)
      .send({ amountCents: 1000, effectiveAt: new Date().toISOString() })
      .expect(403);
    await mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${materialId}/costs`)
      .send({ amountCents: 1000, effectiveAt: new Date().toISOString(), reason: 'Custo inicial' })
      .expect(201);

    const key = randomUUID();
    const first = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/materials/${materialId}/movements`,
    )
      .set('idempotency-key', key)
      .send({ type: 'OPENING_BALANCE', quantity: '10.250001', confirmNegative: false })
      .expect(201);
    const replay = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/materials/${materialId}/movements`,
    )
      .set('idempotency-key', key)
      .send({ type: 'OPENING_BALANCE', quantity: '10.250001', confirmNegative: false })
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.idempotentReplay).toBe(true);

    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/materials/${materialId}/movements`)
      .set('idempotency-key', key)
      .send({ type: 'RECEIPT', quantity: '2', confirmNegative: false })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED'));

    const compensation = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/materials/${materialId}/movements/${first.body.id as string}/compensations`,
    )
      .set('idempotency-key', randomUUID())
      .send({ reason: 'Correção do saldo inicial', confirmNegative: false })
      .expect(201);
    expect(compensation.body.sourceId).toBe(first.body.id);

    const originalStillExists = await pool.query(
      'SELECT quantity_delta::text AS quantity FROM inventory_movements WHERE id=$1',
      [first.body.id],
    );
    expect(originalStillExists.rows[0].quantity).toBe('10.250001');
    await expect(
      pool.query('UPDATE inventory_movements SET reason=$2 WHERE id=$1', [
        first.body.id,
        'tentativa',
      ]),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('serializa saídas concorrentes e impede saldo incorreto', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    const material = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/materials')
      .send({
        code: 'CONCURRENT-01',
        name: 'Material Concorrente',
        baseUnit: 'un',
        minimumStock: '0',
      })
      .expect(201);
    const id = material.body.id as string;
    await mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${id}/movements`)
      .set('idempotency-key', randomUUID())
      .send({ type: 'OPENING_BALANCE', quantity: '1', confirmNegative: false })
      .expect(201);

    const results = await Promise.all([
      mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${id}/movements`)
        .set('idempotency-key', randomUUID())
        .send({ type: 'ADJUSTMENT_OUT', quantity: '1', reason: 'Saída A', confirmNegative: false }),
      mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${id}/movements`)
        .set('idempotency-key', randomUUID())
        .send({ type: 'ADJUSTMENT_OUT', quantity: '1', reason: 'Saída B', confirmNegative: false }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const balance = await manager.agent.get(`/api/v1/materials/${id}/balance`).expect(200);
    expect(balance.body).toEqual({ physical: '0.000000', reserved: '0.000000', available: '0' });
  });

  it('bloqueia negativo para funcionário e audita confirmação do gestor sem segredos', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    const employee = await login('operator@example.test', 'OperatorPassword123!');
    const material = await mutate(employee.agent, employee.csrf, 'post', '/api/v1/materials')
      .send({ code: 'NEG-01', name: 'Saldo Negativo', baseUnit: 'un', minimumStock: '0' })
      .expect(201);
    const id = material.body.id as string;

    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/materials/${id}/movements`)
      .set('idempotency-key', randomUUID())
      .send({
        type: 'ADJUSTMENT_OUT',
        quantity: '1',
        reason: 'Teste funcionário',
        confirmNegative: true,
      })
      .expect(409);
    await mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${id}/movements`)
      .set('idempotency-key', randomUUID())
      .send({
        type: 'ADJUSTMENT_OUT',
        quantity: '1',
        reason: 'Inventário conferido',
        confirmNegative: true,
      })
      .expect(201);

    const auditResponse = await manager.agent.get('/api/v1/audit').expect(200);
    expect(JSON.stringify(auditResponse.body)).not.toMatch(/password|token|cookie|argon2/i);
    expect(auditResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'INVENTORY_MOVEMENT_CREATED',
          metadata: expect.objectContaining({ negativeException: true }),
        }),
      ]),
    );
  });

  it('retorna validação, inexistência e correlação sem stack ou SQL', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    const invalid = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/materials')
      .send({ code: '', name: '', baseUnit: '###', minimumStock: '-1' })
      .expect(400);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalid.body.correlationId).toBeTruthy();
    expect(JSON.stringify(invalid.body)).not.toMatch(/stack|SELECT|INSERT|UPDATE/i);

    await manager.agent
      .get(`/api/v1/materials/${randomUUID()}`)
      .expect(404)
      .expect((response) => expect(response.body.code).toBe('MATERIAL_NOT_FOUND'));

    const secured = await manager.agent.get('/api/v1/materials').expect(200);
    expect(secured.headers['x-content-type-options']).toBe('nosniff');
    expect(secured.headers['x-frame-options']).toBe('DENY');
    expect(secured.headers['referrer-policy']).toBe('no-referrer');
  });

  it('pagina materiais por cursor estável sem repetir itens', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    for (let index = 1; index <= 21; index += 1) {
      await mutate(manager.agent, manager.csrf, 'post', '/api/v1/materials')
        .send({
          code: `PAGE-${index.toString().padStart(2, '0')}`,
          name: `Material paginação ${index}`,
          baseUnit: 'un',
          minimumStock: '0',
        })
        .expect(201);
    }

    const first = await manager.agent
      .get('/api/v1/materials')
      .query({ search: 'PAGE-' })
      .expect(200);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await manager.agent
      .get('/api/v1/materials')
      .query({ search: 'PAGE-', cursor: first.body.nextCursor as string })
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(21);
  });

  it('rejeita desativação do último gestor', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    await mutate(manager.agent, manager.csrf, 'patch', `/api/v1/users/${manager.userId}/status`)
      .send({ status: 'DISABLED' })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('LAST_MANAGER_CANNOT_BE_DISABLED'));
  });
});
