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

  function mutate(
    agent: SuperAgentTest,
    csrf: string,
    method: 'post' | 'patch' | 'put',
    path: string,
  ) {
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

  it('executa catálogo, ficha, preço, orçamento imutável e revisão sem reservar estoque', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    const employee = await login('operator@example.test', 'OperatorPassword123!');

    const material = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/materials')
      .send({ code: 'S2-CANECA', name: 'Caneca branca 325 ml', baseUnit: 'un', minimumStock: '0' })
      .expect(201);
    const materialId = material.body.id as string;
    await mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${materialId}/costs`)
      .send({ amountCents: 1000, effectiveAt: new Date(Date.now() - 1000).toISOString() })
      .expect(201);
    await mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${materialId}/movements`)
      .set('idempotency-key', randomUUID())
      .send({ type: 'OPENING_BALANCE', quantity: '2', confirmNegative: false })
      .expect(201);

    await mutate(employee.agent, employee.csrf, 'post', '/api/v1/catalog/products')
      .send({ code: 'NEGADO', name: 'Não permitido' })
      .expect(403);
    const product = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/catalog/products')
      .send({ code: 'CANECA', name: 'Caneca personalizada' })
      .expect(201);
    const variant = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/catalog/variants')
      .send({ productId: product.body.id, code: '325ML', name: '325 ml branca' })
      .expect(201);
    const technique = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      '/api/v1/catalog/techniques',
    )
      .send({ code: 'SUB', name: 'Sublimação' })
      .expect(201);
    const combination = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      '/api/v1/catalog/combinations',
    )
      .send({
        productId: product.body.id,
        variantId: variant.body.id,
        techniqueId: technique.body.id,
      })
      .expect(201);

    const catalogUpdates = await Promise.all([
      mutate(
        manager.agent,
        manager.csrf,
        'patch',
        `/api/v1/catalog/products/${product.body.id as string}`,
      ).send({ version: 1, name: 'Caneca personalizada A' }),
      mutate(
        manager.agent,
        manager.csrf,
        'patch',
        `/api/v1/catalog/products/${product.body.id as string}`,
      ).send({ version: 1, name: 'Caneca personalizada B' }),
    ]);
    expect(catalogUpdates.map((response) => response.status).sort()).toEqual([200, 409]);

    const sheet = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/technical-sheets')
      .send({
        combinationId: combination.body.id,
        yieldQuantity: '1',
        lossBps: 500,
        technicalNote: 'Uma caneca por impressão',
        components: [{ materialId, quantity: '1', unit: 'un' }],
      })
      .expect(201);
    await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/technical-sheets/${sheet.body.id}/activate`,
    )
      .set('idempotency-key', randomUUID())
      .send({})
      .expect(403);
    const activationKey = randomUUID();
    await mutate(
      manager.agent,
      manager.csrf,
      'post',
      `/api/v1/technical-sheets/${sheet.body.id}/activate`,
    )
      .set('idempotency-key', activationKey)
      .send({})
      .expect(201);

    const sheetRevisionA = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      `/api/v1/technical-sheets/${sheet.body.id}/revise`,
    )
      .set('idempotency-key', randomUUID())
      .send({})
      .expect(201);
    const sheetRevisionB = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      `/api/v1/technical-sheets/${sheet.body.id}/revise`,
    )
      .set('idempotency-key', randomUUID())
      .send({})
      .expect(201);
    const sheetActivations = await Promise.all([
      mutate(
        manager.agent,
        manager.csrf,
        'post',
        `/api/v1/technical-sheets/${sheetRevisionA.body.id as string}/activate`,
      )
        .set('idempotency-key', randomUUID())
        .send({}),
      mutate(
        manager.agent,
        manager.csrf,
        'post',
        `/api/v1/technical-sheets/${sheetRevisionB.body.id as string}/activate`,
      )
        .set('idempotency-key', randomUUID())
        .send({}),
    ]);
    expect(sheetActivations.map((response) => response.status)).toEqual([201, 201]);
    const activeSheetCount = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM technical_sheets
       WHERE combination_id=$1 AND status='ACTIVE'`,
      [combination.body.id],
    );
    expect(activeSheetCount.rows[0]!.count).toBe(1);
    await mutate(
      manager.agent,
      manager.csrf,
      'post',
      `/api/v1/technical-sheets/${sheet.body.id}/activate`,
    )
      .set('idempotency-key', activationKey)
      .send({})
      .expect(201);

    await mutate(manager.agent, manager.csrf, 'put', '/api/v1/pricing/policy')
      .set('idempotency-key', randomUUID())
      .send({
        method: 'MARKUP',
        rateBps: 5000,
        employeeDiscountLimitBps: 500,
        managerDiscountLimitBps: 1500,
        discountOptionsBps: [0, 500, 1000, 1500],
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        components: [
          {
            name: 'Mão de obra',
            type: 'FIXED_UNIT',
            amountCents: 200,
            status: 'ACTIVE',
            displayOrder: 0,
            includeInCostBase: true,
          },
        ],
      })
      .expect(200);
    const employeePolicy = await employee.agent.get('/api/v1/pricing/policy').expect(200);
    expect(employeePolicy.body.managerDiscountLimitBps).toBeUndefined();
    expect(employeePolicy.body.components[0].amountCents).toBeUndefined();
    expect(employeePolicy.body.discountOptionsBps).toEqual([0, 500]);
    const employeeDiscounts = await employee.agent.get('/api/v1/pricing/discounts').expect(200);
    expect(employeeDiscounts.body).toMatchObject({
      employeeLimitBps: 500,
      optionsBps: [0, 500],
    });
    expect(employeeDiscounts.body.managerLimitBps).toBeUndefined();
    const employeeComponents = await employee.agent.get('/api/v1/pricing/components').expect(200);
    expect(employeeComponents.body.items[0].amountCents).toBeUndefined();

    const customer = await mutate(employee.agent, employee.csrf, 'post', '/api/v1/customers')
      .send({ type: 'PERSON', displayName: 'Cliente Sprint Dois', email: 'cliente@example.test' })
      .expect(201);
    await mutate(
      employee.agent,
      employee.csrf,
      'patch',
      `/api/v1/customers/${customer.body.id as string}`,
    )
      .send({ version: 1, phone: '+55 92 90000-0000', email: 'privado@example.test' })
      .expect(200);

    const noCostMaterial = await mutate(manager.agent, manager.csrf, 'post', '/api/v1/materials')
      .send({ code: 'S2-SEM-CUSTO', name: 'Material sem custo', baseUnit: 'un', minimumStock: '0' })
      .expect(201);
    const noCostProduct = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      '/api/v1/catalog/products',
    )
      .send({ code: 'SEM-CUSTO', name: 'Produto sem custo' })
      .expect(201);
    const noCostVariant = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      '/api/v1/catalog/variants',
    )
      .send({ productId: noCostProduct.body.id, code: 'PADRAO', name: 'Padrão' })
      .expect(201);
    const noCostCombination = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      '/api/v1/catalog/combinations',
    )
      .send({
        productId: noCostProduct.body.id,
        variantId: noCostVariant.body.id,
        techniqueId: technique.body.id,
      })
      .expect(201);
    const noCostSheet = await mutate(
      manager.agent,
      manager.csrf,
      'post',
      '/api/v1/technical-sheets',
    )
      .send({
        combinationId: noCostCombination.body.id,
        yieldQuantity: '1',
        lossBps: 0,
        components: [{ materialId: noCostMaterial.body.id, quantity: '1', unit: 'un' }],
      })
      .expect(201);
    await mutate(
      manager.agent,
      manager.csrf,
      'post',
      `/api/v1/technical-sheets/${noCostSheet.body.id as string}/activate`,
    )
      .set('idempotency-key', randomUUID())
      .send({})
      .expect(201);
    const noCostQuote = await mutate(employee.agent, employee.csrf, 'post', '/api/v1/quotes')
      .send({
        customerId: customer.body.id,
        items: [{ combinationId: noCostCombination.body.id, quantity: '1' }],
      })
      .expect(201);
    await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/quotes/${noCostQuote.body.id as string}/issue`,
    )
      .set('idempotency-key', randomUUID())
      .send({ discountBps: 0 })
      .expect(422)
      .expect((response) => expect(response.body.code).toBe('MATERIAL_COST_MISSING'));
    const failedIssue = await pool.query<{ status: string; snapshots: number }>(
      `SELECT q.status,
              (SELECT count(*)::int FROM quote_material_snapshots s
               JOIN quote_items i ON i.id=s.quote_item_id WHERE i.quote_id=q.id) AS snapshots
       FROM quotes q WHERE q.id=$1`,
      [noCostQuote.body.id],
    );
    expect(failedIssue.rows[0]).toEqual({ status: 'DRAFT', snapshots: 0 });

    const quote = await mutate(employee.agent, employee.csrf, 'post', '/api/v1/quotes')
      .send({
        customerId: customer.body.id,
        items: [{ combinationId: combination.body.id, quantity: '3' }],
      })
      .expect(201);
    const quoteId = quote.body.id as string;

    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${quoteId}/simulate`)
      .send({ discountBps: 501 })
      .expect(422)
      .expect((response) => expect(response.body.code).toBe('DISCOUNT_LIMIT_EXCEEDED'));
    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${quoteId}/simulate`)
      .send({ discountBps: 300 })
      .expect(422)
      .expect((response) => expect(response.body.code).toBe('DISCOUNT_OPTION_NOT_AVAILABLE'));
    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${quoteId}/simulate`)
      .send({ discountBps: 0, manualFinalPriceCents: 5000, manualReason: 'Tentativa' })
      .expect(403)
      .expect((response) => expect(response.body.code).toBe('MANUAL_PRICE_REQUIRES_MANAGER'));

    const simulation = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/quotes/${quoteId}/simulate`,
    )
      .send({ discountBps: 500 })
      .expect(201);
    expect(simulation.body).toMatchObject({
      materialCostCents: 3150,
      additionalCostCents: 600,
      costBaseCents: 3750,
      suggestedPriceCents: 5625,
      discountCents: 281,
      finalPriceCents: 5344,
    });
    expect(simulation.body.items[0].materials[0]).toMatchObject({
      baseConsumption: '3',
      lossQuantity: '0.15',
      totalConsumption: '3.15',
      insufficientStock: true,
    });

    const stockBefore = await pool.query(
      `SELECT physical_quantity::text AS physical,reserved_quantity::text AS reserved,
              (SELECT count(*)::int FROM inventory_movements WHERE material_id=$1) AS movements
       FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    const issueKey = randomUUID();
    const issued = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/quotes/${quoteId}/issue`,
    )
      .set('idempotency-key', issueKey)
      .send({ discountBps: 500 })
      .expect(201);
    expect(issued.body).toMatchObject({ status: 'ISSUED', finalPriceCents: '5344' });
    const replay = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/quotes/${quoteId}/issue`,
    )
      .set('idempotency-key', issueKey)
      .send({ discountBps: 500 })
      .expect(201);
    expect(replay.body.id).toBe(quoteId);
    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${quoteId}/issue`)
      .set('idempotency-key', issueKey)
      .send({ discountBps: 0 })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED'));

    const stockAfter = await pool.query(
      `SELECT physical_quantity::text AS physical,reserved_quantity::text AS reserved,
              (SELECT count(*)::int FROM inventory_movements WHERE material_id=$1) AS movements
       FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    expect(stockAfter.rows[0]).toEqual(stockBefore.rows[0]);
    await expect(
      pool.query('UPDATE quotes SET final_price_cents=1 WHERE id=$1', [quoteId]),
    ).rejects.toMatchObject({ code: '55000' });

    await mutate(manager.agent, manager.csrf, 'post', `/api/v1/materials/${materialId}/costs`)
      .send({ amountCents: 1400, effectiveAt: new Date().toISOString(), reason: 'Novo custo' })
      .expect(201);
    await mutate(manager.agent, manager.csrf, 'put', '/api/v1/pricing/policy')
      .set('idempotency-key', randomUUID())
      .send({
        method: 'MARGIN',
        rateBps: 4000,
        employeeDiscountLimitBps: 300,
        managerDiscountLimitBps: 1000,
        discountOptionsBps: [0, 300, 1000],
        effectiveAt: new Date().toISOString(),
        components: [],
      })
      .expect(200);
    const unchanged = await employee.agent.get(`/api/v1/quotes/${quoteId}`).expect(200);
    expect(unchanged.body).toMatchObject({ finalPriceCents: '5344', materialCostCents: '3150' });

    const revisionKey = randomUUID();
    const [revisionA, revisionB] = await Promise.all([
      mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${quoteId}/revise`)
        .set('idempotency-key', revisionKey)
        .send({}),
      mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${quoteId}/revise`)
        .set('idempotency-key', revisionKey)
        .send({}),
    ]);
    expect([revisionA.status, revisionB.status]).toEqual([201, 201]);
    expect(revisionA.body.id).toBe(revisionB.body.id);
    const revisionId = revisionA.body.id as string;
    const revisedSimulation = await mutate(
      employee.agent,
      employee.csrf,
      'post',
      `/api/v1/quotes/${revisionId}/simulate`,
    )
      .send({ discountBps: 300 })
      .expect(201);
    expect(revisedSimulation.body.materialCostCents).toBe(4410);
    await mutate(employee.agent, employee.csrf, 'post', `/api/v1/quotes/${revisionId}/issue`)
      .set('idempotency-key', randomUUID())
      .send({ discountBps: 300 })
      .expect(201);
    await employee.agent
      .get(`/api/v1/quotes/${quoteId}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('SUPERSEDED'));

    const concurrentQuotes = await Promise.all([
      mutate(employee.agent, employee.csrf, 'post', '/api/v1/quotes').send({
        customerId: customer.body.id,
        items: [{ combinationId: combination.body.id, quantity: '1' }],
      }),
      mutate(employee.agent, employee.csrf, 'post', '/api/v1/quotes').send({
        customerId: customer.body.id,
        items: [{ combinationId: combination.body.id, quantity: '1' }],
      }),
    ]);
    expect(concurrentQuotes.map((response) => response.status)).toEqual([201, 201]);
    expect(concurrentQuotes[0].body.commercialNumber).not.toBe(
      concurrentQuotes[1].body.commercialNumber,
    );

    const audit = await manager.agent.get('/api/v1/audit').expect(200);
    expect(audit.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'TECHNICAL_SHEET_ACTIVATED' }),
        expect.objectContaining({ action: 'PRICING_POLICY_ACTIVATED' }),
        expect.objectContaining({ action: 'QUOTE_ISSUED' }),
        expect.objectContaining({ action: 'QUOTE_REVISION_CREATED' }),
      ]),
    );
    expect(JSON.stringify(audit.body)).not.toMatch(/cliente@example\.test/);
    expect(JSON.stringify(audit.body)).not.toMatch(/privado@example\.test|90000-0000/);
  });

  it('rejeita desativação do último gestor', async () => {
    const manager = await login('gestor.integration@example.test', 'IntegrationPassword123!');
    await mutate(manager.agent, manager.csrf, 'patch', `/api/v1/users/${manager.userId}/status`)
      .send({ status: 'DISABLED' })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('LAST_MANAGER_CANNOT_BE_DISABLED'));
  });
});
