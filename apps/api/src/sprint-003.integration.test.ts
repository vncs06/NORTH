import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@north/auth';
import { pool, transaction } from '@north/database';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from '@north/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './main.js';
import { FulfillmentRepository } from './fulfillment-repository.js';
import { NorthRepository } from './repository.js';

const syntheticValidCpf = ['529', '982', '247', '25'].join('');

describe('Sprint 003 com PostgreSQL real', () => {
  const fulfillment = new FulfillmentRepository();
  const north = new NorthRepository();
  let managerId: string;
  let quoteId: string;
  let orderId: string;
  let materialId: string;
  let app: INestApplication;
  const actor = () => ({
    id: managerId,
    name: 'Gestor S3',
    role: 'MANAGER' as const,
    sessionId: randomUUID(),
  });

  async function cloneIssuedQuote(label: string): Promise<string> {
    const id = randomUUID();
    const itemId = randomUUID();
    await pool.query(
      `INSERT INTO quotes(id,commercial_number,revision_number,root_quote_id,customer_id,status,final_price_cents,
       customer_display_name_snapshot,created_by,updated_by,issued_by,issued_at)
       SELECT $1,$2,1,$1,customer_id,'ISSUED',final_price_cents,customer_display_name_snapshot,
              created_by,updated_by,issued_by,clock_timestamp() FROM quotes WHERE id=$3`,
      [id, `ORC-${label}-${id.slice(0, 6)}`, quoteId],
    );
    await pool.query(
      `INSERT INTO quote_items(id,quote_id,combination_id,requested_quantity,display_order,product_code_snapshot,
       product_name_snapshot,variant_code_snapshot,variant_name_snapshot,technique_code_snapshot,
       technique_name_snapshot,technical_sheet_id,technical_sheet_version,yield_quantity_snapshot,
       loss_bps_snapshot,material_cost_cents,insufficient_stock)
       SELECT $1,$2,combination_id,requested_quantity,display_order,product_code_snapshot,product_name_snapshot,
              variant_code_snapshot,variant_name_snapshot,technique_code_snapshot,technique_name_snapshot,
              technical_sheet_id,technical_sheet_version,yield_quantity_snapshot,loss_bps_snapshot,
              material_cost_cents,insufficient_stock FROM quote_items WHERE quote_id=$3`,
      [itemId, id, quoteId],
    );
    await pool.query(
      `INSERT INTO quote_material_snapshots(id,quote_item_id,material_id,material_code,material_name,unit,
       component_quantity,base_consumption,loss_quantity,total_consumption,loss_bps,unit_cost_cents,
       total_cost_cents,physical_quantity,reserved_quantity,available_quantity,insufficient_stock,material_cost_id)
       SELECT $1,$2,material_id,material_code,material_name,unit,component_quantity,base_consumption,loss_quantity,
              total_consumption,loss_bps,unit_cost_cents,total_cost_cents,physical_quantity,reserved_quantity,
              available_quantity,insufficient_stock,material_cost_id FROM quote_material_snapshots
       WHERE quote_item_id=(SELECT id FROM quote_items WHERE quote_id=$3 LIMIT 1)`,
      [randomUUID(), itemId, quoteId],
    );
    return id;
  }

  beforeAll(async () => {
    await expect(verifyConnectedTestDatabase(pool, configuredTestDatabasePolicy())).resolves.toBe(
      'north_test',
    );
    const installation = await pool.query('SELECT id FROM installation');
    if (!installation.rows[0]) {
      await north.bootstrap({
        companyName: 'Empresa de Integração',
        timezone: 'America/Manaus',
        managerName: 'Gestor Teste',
        managerEmail: 'gestor.integration@example.test',
        managerPassword: 'IntegrationPassword123!',
      });
    }
    const manager = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE role='MANAGER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`,
    );
    managerId = manager.rows[0]!.id;
    materialId = randomUUID();
    const customerId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const techniqueId = randomUUID();
    const combinationId = randomUUID();
    const sheetId = randomUUID();
    const quoteItemId = randomUUID();
    const materialCostId = randomUUID();
    quoteId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO materials(id,code,normalized_code,name,base_unit,status,created_by,updated_by)
        VALUES($1,$2,$2,'Material Sprint 003','un','ACTIVE',$3,$3)`,
        [materialId, `MAT-${materialId.slice(0, 6)}`, managerId],
      );
      await client.query(
        `INSERT INTO inventory_balances(material_id,physical_quantity,reserved_quantity) VALUES($1,10,0)`,
        [materialId],
      );
      await client.query(
        `INSERT INTO material_costs(id,material_id,amount_cents,effective_at,created_by)
        VALUES($1,$2,100,clock_timestamp(),$3)`,
        [materialCostId, materialId, managerId],
      );
      await client.query(
        `INSERT INTO customers(id,type,display_name,normalized_display_name,status,created_by,updated_by)
        VALUES($1,'PERSON','Cliente Sprint 003','cliente sprint 003','ACTIVE',$2,$2)`,
        [customerId, managerId],
      );
      await client.query(
        `INSERT INTO products(id,code,normalized_code,name,status,created_by,updated_by)
        VALUES($1,$2,$2,'Produto S3','ACTIVE',$3,$3)`,
        [productId, `PROD-${productId.slice(0, 6)}`, managerId],
      );
      await client.query(
        `INSERT INTO product_variants(id,product_id,code,normalized_code,name,status,created_by,updated_by)
        VALUES($1,$2,'V1','V1','Variante S3','ACTIVE',$3,$3)`,
        [variantId, productId, managerId],
      );
      await client.query(
        `INSERT INTO customization_techniques(id,code,normalized_code,name,status,created_by,updated_by)
        VALUES($1,$2,$2,'Técnica S3','ACTIVE',$3,$3)`,
        [techniqueId, `TEC-${techniqueId.slice(0, 6)}`, managerId],
      );
      await client.query(
        `INSERT INTO catalog_combinations(id,product_id,variant_id,technique_id,status,created_by,updated_by)
        VALUES($1,$2,$3,$4,'ACTIVE',$5,$5)`,
        [combinationId, productId, variantId, techniqueId, managerId],
      );
      await client.query(
        `INSERT INTO technical_sheets(id,combination_id,version_number,status,yield_quantity,loss_bps,created_by,activated_by,activated_at)
        VALUES($1,$2,1,'ACTIVE',1,0,$3,$3,clock_timestamp())`,
        [sheetId, combinationId, managerId],
      );
      await client.query(
        `INSERT INTO technical_sheet_components(id,technical_sheet_id,material_id,quantity,unit,display_order)
        VALUES($1,$2,$3,2.5,'un',0)`,
        [randomUUID(), sheetId, materialId],
      );
      await client.query(
        `INSERT INTO quotes(id,commercial_number,revision_number,root_quote_id,customer_id,status,
        final_price_cents,customer_display_name_snapshot,created_by,updated_by,issued_by,issued_at)
        VALUES($1,$2,1,$1,$3,'ISSUED',10000,'Cliente Sprint 003',$4,$4,$4,clock_timestamp())`,
        [quoteId, `ORC-S3-${quoteId.slice(0, 6)}`, customerId, managerId],
      );
      await client.query(
        `INSERT INTO quote_items(id,quote_id,combination_id,requested_quantity,display_order,
        product_code_snapshot,product_name_snapshot,variant_code_snapshot,variant_name_snapshot,
        technique_code_snapshot,technique_name_snapshot,technical_sheet_id,technical_sheet_version,
        yield_quantity_snapshot,loss_bps_snapshot,material_cost_cents,insufficient_stock)
        VALUES($1,$2,$3,1,0,$4,'Produto S3','V1','Variante S3',$5,'Técnica S3',$6,1,1,0,250,false)`,
        [
          quoteItemId,
          quoteId,
          combinationId,
          `PROD-${productId.slice(0, 6)}`,
          `TEC-${techniqueId.slice(0, 6)}`,
          sheetId,
        ],
      );
      await client.query(
        `INSERT INTO quote_material_snapshots(id,quote_item_id,material_id,material_code,material_name,unit,
        component_quantity,base_consumption,loss_quantity,total_consumption,loss_bps,unit_cost_cents,
        total_cost_cents,physical_quantity,reserved_quantity,available_quantity,insufficient_stock,material_cost_id)
        VALUES($1,$2,$3,$4,'Material Sprint 003','un',2.5,2.5,0,2.5,0,100,250,10,0,10,false,$5)`,
        [randomUUID(), quoteItemId, materialId, `MAT-${materialId.slice(0, 6)}`, materialCostId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await pool.query(
      `INSERT INTO users(id,name,email_normalized,password_hash,role,status,created_by)
      VALUES($1,'Funcionário S3','funcionario.s3@example.test',$2,'EMPLOYEE','ACTIVE',$3)
      ON CONFLICT(email_normalized) DO NOTHING`,
      [randomUUID(), await hashPassword('EmployeePassword123!'), managerId],
    );
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('aplica a matriz de autorização no servidor para configuração e exceções', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({
        email: 'funcionario.s3@example.test',
        password: 'EmployeePassword123!',
      })
      .expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('north_csrf='),
    );
    const csrf = decodeURIComponent(cookie!.split(';')[0]!.split('=')[1]!);
    await agent
      .put('/api/v1/order-settings/deposit-policy')
      .set('origin', 'http://localhost:3000')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'employee-forbidden-policy')
      .send({ mode: 'PERCENTAGE', rateBps: 5000, effectiveAt: new Date().toISOString() })
      .expect(403);
    const integrationState = await agent.get('/api/v1/integrations/asaas').expect(200);
    expect(integrationState.body).toMatchObject({ status: 'NOT_CONFIGURED' });
    await agent
      .put('/api/v1/integrations/asaas')
      .set('origin', 'http://localhost:3000')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'employee-forbidden-asaas')
      .send({
        environment: 'SANDBOX',
        apiKey: 'stub-sandbox-api-key-000000000000',
        notificationEmail: 'alerts@example.test',
        webhookAuthToken: 'employee-must-not-configure-000000000000',
      })
      .expect(403);
    await agent.get('/api/v1/orders').expect(200);
  });

  it('versiona política, rejeita chave idempotente divergente e converte snapshot emitido', async () => {
    const input = {
      mode: 'PERCENTAGE' as const,
      rateBps: 5000,
      effectiveAt: new Date().toISOString(),
    };
    await fulfillment.putDepositPolicy(actor(), input, 'policy-s3', randomUUID());
    await expect(
      fulfillment.putDepositPolicy(actor(), { ...input, rateBps: 4000 }, 'policy-s3', randomUUID()),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const conversions = await Promise.allSettled([
      fulfillment.convertQuote(actor(), quoteId, 'convert-s3-a', randomUUID()),
      fulfillment.convertQuote(actor(), quoteId, 'convert-s3-b', randomUUID()),
    ]);
    expect(conversions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(conversions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winningIndex = conversions.findIndex((result) => result.status === 'fulfilled');
    const order = (
      conversions[winningIndex] as PromiseFulfilledResult<
        Awaited<ReturnType<typeof fulfillment.convertQuote>>
      >
    ).value;
    const replay = await fulfillment.convertQuote(
      actor(),
      quoteId,
      winningIndex === 0 ? 'convert-s3-a' : 'convert-s3-b',
      randomUUID(),
    );
    orderId = order.id as string;
    expect(replay.id).toBe(orderId);
    expect(order).toMatchObject({ depositAmountCents: '5000', totalAmountCents: '10000' });
    const balance = await pool.query(
      `SELECT physical_quantity::text physical,reserved_quantity::text reserved
      FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    expect(balance.rows[0]).toEqual({ physical: '10.000000', reserved: '0.000000' });
    const fixed = await Promise.all([
      fulfillment.putDepositPolicy(
        actor(),
        {
          mode: 'FIXED_AMOUNT',
          fixedAmountCents: 2500,
          allowAboveTotal: false,
          effectiveAt: new Date().toISOString(),
        },
        'policy-fixed-a',
        randomUUID(),
      ),
      fulfillment.putDepositPolicy(
        actor(),
        {
          mode: 'FIXED_AMOUNT',
          fixedAmountCents: 3000,
          allowAboveTotal: false,
          effectiveAt: new Date().toISOString(),
        },
        'policy-fixed-b',
        randomUUID(),
      ),
    ]);
    expect(new Set(fixed.map((item) => item.versionNumber)).size).toBe(2);
    expect((await fulfillment.getOrder(orderId)).depositAmountCents).toBe('5000');
  });

  it('gera dois números comerciais únicos sob conversões simultâneas', async () => {
    const [firstQuote, secondQuote] = await Promise.all([
      cloneIssuedQuote('CONC-A'),
      cloneIssuedQuote('CONC-B'),
    ]);
    const [first, second] = await Promise.all([
      fulfillment.convertQuote(actor(), firstQuote, 'convert-conc-a', randomUUID()),
      fulfillment.convertQuote(actor(), secondQuote, 'convert-conc-b', randomUUID()),
    ]);
    expect(first.commercialNumber).not.toBe(second.commercialNumber);
    const count = await pool.query<{ count: number }>(
      `SELECT count(DISTINCT commercial_number)::int count FROM orders WHERE id=ANY($1::uuid[])`,
      [[first.id, second.id]],
    );
    expect(count.rows[0]!.count).toBe(2);
  });

  it('protege documento, segredos e persiste webhook idempotente antes do processamento', async () => {
    const order = await fulfillment.getOrder(orderId);
    await fulfillment.putBillingDocument(
      actor(),
      order.customerId,
      syntheticValidCpf,
      randomUUID(),
    );
    const invalidWebhook = await fetch('http://127.0.0.1:3199/v3/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'NORTH-contract-test',
        access_token: 'stub-sandbox-api-key-000000000000',
        'x-north-asaas-environment': 'SANDBOX',
      },
      body: JSON.stringify({ name: 'incompleto', url: 'https://north.example.test/hook' }),
    });
    expect(invalidWebhook.status).toBe(400);
    process.env.ASAAS_STUB_SCENARIO = 'timeout-after-webhook';
    await fulfillment.configureAsaas(
      actor(),
      {
        environment: 'SANDBOX',
        apiKey: 'stub-sandbox-api-key-000000000000',
        webhookAuthToken: 'stub-webhook-token-000000000000000000000',
        notificationEmail: 'alerts@example.test',
      },
      'asaas-s3',
      randomUUID(),
    );
    delete process.env.ASAAS_STUB_SCENARIO;
    const stubStats = (await (await fetch('http://127.0.0.1:3199/__stub/stats')).json()) as {
      webhooks: number;
      calls: Array<{ body: Record<string, unknown> }>;
    };
    expect(stubStats.webhooks).toBe(1);
    expect(JSON.stringify(stubStats.calls)).not.toContain('stub-webhook-token');
    await fulfillment.putAsaasPaymentMethods(
      actor(),
      ['PIX', 'BOLETO', 'CREDIT_CARD'],
      'asaas-methods-s3',
      randomUUID(),
    );
    await fulfillment.putFeePolicy(
      actor(),
      {
        effectiveAt: new Date().toISOString(),
        methods: [
          { billingType: 'PIX', strategy: 'ABSORB' },
          { billingType: 'BOLETO', strategy: 'ABSORB' },
          { billingType: 'CREDIT_CARD', strategy: 'ABSORB' },
        ],
      },
      'fee-policy-s3',
      randomUUID(),
    );
    const concurrentFeePolicies = await Promise.all([
      fulfillment.putFeePolicy(
        actor(),
        {
          effectiveAt: new Date().toISOString(),
          methods: [
            { billingType: 'PIX', strategy: 'ABSORB' },
            { billingType: 'BOLETO', strategy: 'ABSORB' },
            { billingType: 'CREDIT_CARD', strategy: 'PASS_THROUGH' },
          ],
        },
        'fee-policy-concurrent-a',
        randomUUID(),
      ),
      fulfillment.putFeePolicy(
        actor(),
        {
          effectiveAt: new Date().toISOString(),
          methods: [
            { billingType: 'PIX', strategy: 'PASS_THROUGH' },
            { billingType: 'BOLETO', strategy: 'ABSORB' },
            { billingType: 'CREDIT_CARD', strategy: 'ABSORB' },
          ],
        },
        'fee-policy-concurrent-b',
        randomUUID(),
      ),
    ]);
    expect(new Set(concurrentFeePolicies.map((item) => item?.versionNumber)).size).toBe(2);
    await fulfillment.putFeePolicy(
      actor(),
      {
        effectiveAt: new Date().toISOString(),
        methods: [
          { billingType: 'PIX', strategy: 'PASS_THROUGH' },
          { billingType: 'BOLETO', strategy: 'PASS_THROUGH' },
          { billingType: 'CREDIT_CARD', strategy: 'PASS_THROUGH' },
        ],
      },
      'fee-policy-pass-through',
      randomUUID(),
    );
    const legacyOrder = await pool.query<{ id: string }>(
      'SELECT id FROM orders WHERE id<>$1 ORDER BY created_at LIMIT 1',
      [orderId],
    );
    await expect(
      fulfillment.createCharge(
        actor(),
        legacyOrder.rows[0]!.id,
        { billingType: 'CREDIT_CARD', dueDate: '2026-12-03' },
        'legacy-pass-through',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'QUOTE_FEE_REVISION_REQUIRED' });
    await fulfillment.putFeePolicy(
      actor(),
      {
        effectiveAt: new Date().toISOString(),
        methods: [
          { billingType: 'PIX', strategy: 'ABSORB' },
          { billingType: 'BOLETO', strategy: 'ABSORB' },
          { billingType: 'CREDIT_CARD', strategy: 'ABSORB' },
        ],
      },
      'fee-policy-final-absorb',
      randomUUID(),
    );
    const fees = await fulfillment.getAsaasFees();
    expect(fees).toMatchObject({ status: 'AVAILABLE', environment: 'SANDBOX' });
    expect(fees.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billingType: 'CREDIT_CARD', percentageBps: 299 }),
      ]),
    );
    const rotations = await Promise.allSettled([
      fulfillment.rotateAsaasKey(
        actor(),
        'stub-rotated-api-key-000000000000',
        'rotate-a',
        randomUUID(),
      ),
      fulfillment.rotateAsaasKey(
        actor(),
        'stub-rotated-api-key-000000000000',
        'rotate-b',
        randomUUID(),
      ),
    ]);
    expect(rotations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rotations.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await fulfillment.getAsaasConfiguration()).toMatchObject({ status: 'ACTIVE' });
    const stored = await pool.query(
      `SELECT encode(api_key_ciphertext,'escape') ciphertext FROM asaas_connections WHERE status='ACTIVE'`,
    );
    expect(stored.rows[0].ciphertext).not.toContain('stub-sandbox-api-key');
    await expect(
      fulfillment.receiveWebhook('wrong-token', {
        id: 'evt-denied',
        event: 'PAYMENT_CREATED',
        payment: { id: 'pay-denied' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_TOKEN' });
    const event = { id: 'evt-s3-duplicate', event: 'PAYMENT_CREATED', payment: { id: 'pay-s3' } };
    expect(
      await fulfillment.receiveWebhook('stub-webhook-token-000000000000000000000', event),
    ).toMatchObject({ duplicate: false });
    expect(
      await fulfillment.receiveWebhook('stub-webhook-token-000000000000000000000', event),
    ).toMatchObject({ duplicate: true });
    const count = await pool.query(
      `SELECT count(*)::int count FROM asaas_webhook_inbox WHERE external_event_id=$1`,
      [event.id],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('enfileira cobrança sem chamar provedor dentro da transação', async () => {
    const order = await fulfillment.createCharge(
      actor(),
      orderId,
      { billingType: 'PIX', dueDate: '2026-12-01' },
      'charge-s3',
      randomUUID(),
    );
    expect(order.charges[0]).toMatchObject({ status: 'PENDING_CREATION', amountCents: '5000' });
    const queued = await pool.query(
      `SELECT status FROM integration_outbox WHERE aggregate_type='payment_charge'`,
    );
    expect(queued.rows[0].status).toBe('PENDING');
    await fetch('http://127.0.0.1:3199/__stub/scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario: 'timeout-after' }),
    });
    const workers = await Promise.all([
      fulfillment.processOneOutbox('worker-a'),
      fulfillment.processOneOutbox('worker-b'),
    ]);
    expect(workers.filter(Boolean)).toHaveLength(1);
    await fetch('http://127.0.0.1:3199/__stub/scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario: 'success' }),
    });
    const stats = (await (await fetch('http://127.0.0.1:3199/__stub/stats')).json()) as {
      payments: number;
    };
    expect(stats.payments).toBe(1);
    const created = await fulfillment.getOrder(orderId);
    expect(created.charges[0]).toMatchObject({ status: 'CREATED', billingType: 'PIX' });
    const another = await pool.query<{ id: string }>(
      `SELECT id FROM orders WHERE id<>$1 ORDER BY created_at LIMIT 1`,
      [orderId],
    );
    const duplicateCharge = await Promise.allSettled([
      fulfillment.createCharge(
        actor(),
        another.rows[0]!.id,
        { billingType: 'BOLETO', dueDate: '2026-12-02' },
        'charge-concurrent-a',
        randomUUID(),
      ),
      fulfillment.createCharge(
        actor(),
        another.rows[0]!.id,
        { billingType: 'BOLETO', dueDate: '2026-12-02' },
        'charge-concurrent-b',
        randomUUID(),
      ),
    ]);
    expect(duplicateCharge.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM payment_charges WHERE order_id=$1',
          [another.rows[0]!.id],
        )
      ).rows[0]!.count,
    ).toBe(1);
  });

  it('separa solicitação e rejeição da arte e bloqueia manipulação por funcionário', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    const uploaded = await fulfillment.uploadArtwork(
      actor(),
      orderId,
      { originalName: 'rejeitar.png', mimeType: 'image/png', contentBase64: png },
      'art-reject',
      randomUUID(),
    );
    const artworkId = uploaded.artworks[0]!.id;
    await fulfillment.requestArtworkApproval(actor(), artworkId, 'request-reject', randomUUID());
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'funcionario.s3@example.test', password: 'EmployeePassword123!' })
      .expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('north_csrf='),
    );
    const csrf = decodeURIComponent(cookie!.split(';')[0]!.split('=')[1]!);
    await agent
      .post(`/api/v1/artwork-versions/${artworkId}/reject`)
      .set('origin', 'http://localhost:3000')
      .set('x-csrf-token', csrf)
      .set('idempotency-key', 'employee-reject')
      .send({
        reason: 'Cliente rejeitou',
        confirmationSource: 'atendimento',
        confirmedAt: new Date().toISOString(),
      })
      .expect(403);
    const rejected = await fulfillment.rejectArtwork(
      actor(),
      artworkId,
      {
        reason: 'Cliente rejeitou a primeira composição.',
        confirmationSource: 'Atendimento externo confirmado',
        confirmedAt: new Date().toISOString(),
      },
      'manager-reject',
      randomUUID(),
    );
    expect(rejected.artworks[0]).toMatchObject({ id: artworkId, status: 'REJECTED' });
  });

  it('versiona arte, exige confirmação externa e reserva sem consumir estoque', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    let order = await fulfillment.uploadArtwork(
      actor(),
      orderId,
      { originalName: 'arte.png', mimeType: 'image/png', contentBase64: png },
      'art-s3',
      randomUUID(),
    );
    const artworkId = order.artworks[0]!.id;
    await expect(
      fulfillment.approveArtwork(
        actor(),
        orderId,
        artworkId,
        'evidência',
        'approve-too-early',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ARTWORK_APPROVAL_CONFLICT' });
    await fulfillment.requestArtworkApproval(actor(), artworkId, 'request-art-s3', randomUUID());
    await fulfillment.confirmArtwork(
      actor(),
      orderId,
      artworkId,
      'cliente confirmou externamente',
      'confirm-s3',
      randomUUID(),
    );
    const artRace = await Promise.allSettled([
      fulfillment.approveArtwork(
        actor(),
        orderId,
        artworkId,
        'evidência conferida',
        'approve-s3',
        randomUUID(),
      ),
      fulfillment.rejectArtwork(
        actor(),
        artworkId,
        {
          reason: 'Rejeição concorrente tardia.',
          confirmationSource: 'Atendimento',
          confirmedAt: new Date().toISOString(),
        },
        'reject-race-s3',
        randomUUID(),
      ),
      fulfillment.uploadArtwork(
        actor(),
        orderId,
        { originalName: 'arte-concorrente.png', mimeType: 'image/png', contentBase64: png },
        'art-concurrent-new-version',
        randomUUID(),
      ),
    ]);
    expect(artRace.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(
      1,
    );
    order = await fulfillment.getOrder(orderId);
    const newestArtwork = order.artworks[0]!.id;
    expect(newestArtwork).not.toBe(artworkId);
    expect(order.artworks.find((item: { id: string }) => item.id === artworkId)!.status).toBe(
      'SUPERSEDED',
    );
    await fulfillment.requestArtworkApproval(
      actor(),
      newestArtwork,
      'request-newest-s3',
      randomUUID(),
    );
    await fulfillment.confirmArtwork(
      actor(),
      orderId,
      newestArtwork,
      'cliente confirmou nova versão',
      'confirm-newest-s3',
      randomUUID(),
    );
    order = await fulfillment.approveArtwork(
      actor(),
      orderId,
      newestArtwork,
      'evidência da nova versão',
      'approve-newest-s3',
      randomUUID(),
    );
    expect(order.readiness.blockers).toContain('DEPOSIT_NOT_CONFIRMED');
    const reevaluations = await Promise.all([
      fulfillment.approveFinancialException(
        actor(),
        orderId,
        'Sinal dispensado pelo gestor para este pedido.',
        'financial-s3-a',
        randomUUID(),
      ),
      fulfillment.approveFinancialException(
        actor(),
        orderId,
        'Sinal dispensado pelo gestor para este pedido.',
        'financial-s3-b',
        randomUUID(),
      ),
    ]);
    order = reevaluations[0];
    expect(order.status).toBe('READY_FOR_PRODUCTION');
    const balance = await pool.query(
      `SELECT physical_quantity::text physical,reserved_quantity::text reserved
      FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    expect(balance.rows[0]).toEqual({ physical: '10.000000', reserved: '2.500000' });
    const movements = await pool.query(
      `SELECT type,quantity_delta::text physical_delta,
      reserved_quantity_delta::text reserved_delta FROM inventory_movements WHERE source_id=$1`,
      [orderId],
    );
    expect(movements.rows).toContainEqual({
      type: 'RESERVATION',
      physical_delta: '0.000000',
      reserved_delta: '2.500000',
    });
    expect(movements.rows.filter((movement) => movement.type === 'RESERVATION')).toHaveLength(1);
  });

  it('cancela sem apagar histórico, libera reserva por movimento inverso e não cria estorno automático', async () => {
    const beforeCancel = await fulfillment.getOrder(orderId);
    const externalChargeId = beforeCancel.charges[0]!.externalChargeId as string;
    await fulfillment.receiveWebhook('stub-webhook-token-000000000000000000000', {
      id: 'evt-cancel-race',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: externalChargeId },
    });
    const [cancelled] = await Promise.all([
      fulfillment.cancelOrder(
        actor(),
        orderId,
        'Cliente cancelou antes da produção.',
        'cancel-s3',
        randomUUID(),
      ),
      fulfillment.processOneWebhook('cancel-race-worker'),
    ]);
    expect(cancelled.status).toBe('CANCELLED');
    const balance = await pool.query(
      `SELECT physical_quantity::text physical,reserved_quantity::text reserved
      FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    expect(balance.rows[0]).toEqual({ physical: '10.000000', reserved: '0.000000' });
    const releases = await pool.query(
      `SELECT count(*)::int count FROM inventory_movements
      WHERE source_id=$1 AND type='RELEASE'`,
      [orderId],
    );
    expect(releases.rows[0].count).toBe(1);
    await fulfillment.receiveWebhook('stub-webhook-token-000000000000000000000', {
      id: 'evt-confirmed-parallel',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: externalChargeId },
    });
    await fulfillment.receiveWebhook('stub-webhook-token-000000000000000000000', {
      id: 'evt-refunded-parallel',
      event: 'PAYMENT_REFUNDED',
      payment: { id: externalChargeId },
    });
    await Promise.all([
      fulfillment.processOneWebhook('webhook-a'),
      fulfillment.processOneWebhook('webhook-b'),
    ]);
    while (await fulfillment.processOneWebhook('webhook-drain')) {
      // processa os eventos restantes; a precedência terminal deve ser determinística
    }
    const final = await fulfillment.getOrder(orderId);
    expect(final.status).toBe('CANCELLED');
    expect(final.charges[0]!.status).toBe('REFUNDED');
  });

  it('mantém falta de saldo como alerta e permite exceção gerencial explícita sem baixa física', async () => {
    const secondQuote = randomUUID();
    const secondItem = randomUUID();
    const source = await pool.query<{
      combinationId: string;
      technicalSheetId: string;
      materialCostId: string;
    }>(
      `SELECT qi.combination_id AS "combinationId",qi.technical_sheet_id AS "technicalSheetId",
              qm.material_cost_id AS "materialCostId" FROM quote_items qi
       JOIN quote_material_snapshots qm ON qm.quote_item_id=qi.id WHERE qi.quote_id=$1`,
      [quoteId],
    );
    const customer = await pool.query<{ id: string }>(
      'SELECT customer_id AS id FROM quotes WHERE id=$1',
      [quoteId],
    );
    await pool.query(
      `UPDATE inventory_balances SET physical_quantity=1,reserved_quantity=0 WHERE material_id=$1`,
      [materialId],
    );
    await pool.query(
      `INSERT INTO quotes(id,commercial_number,revision_number,root_quote_id,customer_id,status,final_price_cents,
      customer_display_name_snapshot,created_by,updated_by,issued_by,issued_at)
      VALUES($1,$2,1,$1,$3,'ISSUED',20000,'Cliente Sprint 003',$4,$4,$4,clock_timestamp())`,
      [secondQuote, `ORC-S3-${secondQuote.slice(0, 6)}`, customer.rows[0]!.id, managerId],
    );
    await pool.query(
      `INSERT INTO quote_items(id,quote_id,combination_id,requested_quantity,display_order,product_code_snapshot,
      product_name_snapshot,variant_code_snapshot,variant_name_snapshot,technique_code_snapshot,
      technique_name_snapshot,technical_sheet_id,technical_sheet_version,yield_quantity_snapshot,
      loss_bps_snapshot,material_cost_cents,insufficient_stock)
      VALUES($1,$2,$3,1,0,'P-S3','Produto S3','V1','Variante S3','T-S3','Técnica S3',$4,1,1,0,2000,true)`,
      [secondItem, secondQuote, source.rows[0]!.combinationId, source.rows[0]!.technicalSheetId],
    );
    await pool.query(
      `INSERT INTO quote_material_snapshots(id,quote_item_id,material_id,material_code,material_name,unit,
      component_quantity,base_consumption,loss_quantity,total_consumption,loss_bps,unit_cost_cents,
      total_cost_cents,physical_quantity,reserved_quantity,available_quantity,insufficient_stock,material_cost_id)
      VALUES($1,$2,$3,'M-S3','Material Sprint 003','un',20,20,0,20,0,100,2000,1,0,1,true,$4)`,
      [randomUUID(), secondItem, materialId, source.rows[0]!.materialCostId],
    );
    let order = await fulfillment.convertQuote(
      actor(),
      secondQuote,
      'convert-shortage',
      randomUUID(),
    );
    const shortageOrder = order.id as string;
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    order = await fulfillment.uploadArtwork(
      actor(),
      shortageOrder,
      { originalName: 'arte-2.png', mimeType: 'image/png', contentBase64: png },
      'art-shortage',
      randomUUID(),
    );
    const artwork = order.artworks[0]!.id;
    await fulfillment.requestArtworkApproval(actor(), artwork, 'request-shortage', randomUUID());
    await fulfillment.confirmArtwork(
      actor(),
      shortageOrder,
      artwork,
      'confirmado',
      'confirm-shortage',
      randomUUID(),
    );
    await fulfillment.approveArtwork(
      actor(),
      shortageOrder,
      artwork,
      'conferido',
      'approve-shortage',
      randomUUID(),
    );
    order = await fulfillment.approveFinancialException(
      actor(),
      shortageOrder,
      'Sinal dispensado.',
      'financial-shortage',
      randomUUID(),
    );
    expect(order.status).toBe('PENDING_READINESS');
    expect(order.readiness.blockers).toContain('INSUFFICIENT_STOCK');
    expect(order.alerts).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'OPEN' })]),
    );
    order = await fulfillment.evaluateReadiness(
      actor(),
      shortageOrder,
      {
        confirmStockException: true,
        stockExceptionReason: 'Compra emergencial confirmada pelo gestor.',
      },
      'override-shortage',
      randomUUID(),
    );
    expect(order.status).toBe('READY_FOR_PRODUCTION');
    const balance = await pool.query(
      `SELECT physical_quantity::text physical,reserved_quantity::text reserved
      FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    expect(balance.rows[0]).toEqual({ physical: '1.000000', reserved: '20.000000' });
    await fulfillment.cancelOrder(
      actor(),
      shortageOrder,
      'Encerrar cenário de teste.',
      'cancel-shortage',
      randomUUID(),
    );
  });

  it('serializa duas reservas do mesmo material e cancelamento concorrente sem duplicar saldo', async () => {
    async function pendingOrder(label: string) {
      const cloned = await cloneIssuedQuote(label);
      const converted = await fulfillment.convertQuote(
        actor(),
        cloned,
        `convert-${label}`,
        randomUUID(),
      );
      const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
      const uploaded = await fulfillment.uploadArtwork(
        actor(),
        converted.id as string,
        { originalName: `${label}.png`, mimeType: 'image/png', contentBase64: png },
        `art-${label}`,
        randomUUID(),
      );
      const artworkId = uploaded.artworks[0]!.id;
      await fulfillment.requestArtworkApproval(
        actor(),
        artworkId,
        `request-${label}`,
        randomUUID(),
      );
      await fulfillment.confirmArtwork(
        actor(),
        converted.id as string,
        artworkId,
        'confirmado',
        `confirm-${label}`,
        randomUUID(),
      );
      await fulfillment.approveArtwork(
        actor(),
        converted.id as string,
        artworkId,
        'conferido',
        `approve-${label}`,
        randomUUID(),
      );
      await fulfillment.approveFinancialException(
        actor(),
        converted.id as string,
        'Sinal dispensado para teste concorrente.',
        `financial-${label}`,
        randomUUID(),
      );
      return converted.id as string;
    }
    const [first, second] = await Promise.all([pendingOrder('stock-a'), pendingOrder('stock-b')]);
    await Promise.all([
      fulfillment.evaluateReadiness(
        actor(),
        first,
        { confirmStockException: true, stockExceptionReason: 'Exceção concorrente A.' },
        'reserve-stock-a',
        randomUUID(),
      ),
      fulfillment.evaluateReadiness(
        actor(),
        second,
        { confirmStockException: true, stockExceptionReason: 'Exceção concorrente B.' },
        'reserve-stock-b',
        randomUUID(),
      ),
    ]);
    const reserved = await pool.query<{ reserved: string }>(
      'SELECT reserved_quantity::text reserved FROM inventory_balances WHERE material_id=$1',
      [materialId],
    );
    expect(reserved.rows[0]!.reserved).toBe('5.000000');
    const active = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM inventory_reservations WHERE order_id=ANY($1::uuid[]) AND status='ACTIVE'`,
      [[first, second]],
    );
    expect(active.rows[0]!.count).toBe(2);
    await Promise.all([
      fulfillment.cancelOrder(
        actor(),
        first,
        'Encerrar concorrência A.',
        'cancel-stock-a',
        randomUUID(),
      ),
      fulfillment.cancelOrder(
        actor(),
        second,
        'Encerrar concorrência B.',
        'cancel-stock-b',
        randomUUID(),
      ),
    ]);

    const raced = await pendingOrder('cancel-reserve');
    await Promise.allSettled([
      fulfillment.evaluateReadiness(
        actor(),
        raced,
        { confirmStockException: true, stockExceptionReason: 'Reserva concorrente.' },
        'reserve-race',
        randomUUID(),
      ),
      fulfillment.cancelOrder(
        actor(),
        raced,
        'Cancelamento concorrente.',
        'cancel-race',
        randomUUID(),
      ),
    ]);
    expect((await fulfillment.getOrder(raced)).status).toBe('CANCELLED');
    const remaining = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM inventory_reservations WHERE order_id=$1 AND status='ACTIVE'`,
      [raced],
    );
    expect(remaining.rows[0]!.count).toBe(0);
  });

  it('repete transação PostgreSQL após conflito real 40001 e conserva o estado final', async () => {
    await pool.query('DROP TABLE IF EXISTS sprint003_retry_probe');
    await pool.query(
      'CREATE UNLOGGED TABLE sprint003_retry_probe(id integer PRIMARY KEY,value integer NOT NULL)',
    );
    await pool.query('INSERT INTO sprint003_retry_probe VALUES(1,0)');
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempts = [0, 0];
    const increment = (index: number) =>
      transaction(async (client) => {
        attempts[index] = (attempts[index] ?? 0) + 1;
        const current = await client.query<{ value: number }>(
          'SELECT value FROM sprint003_retry_probe WHERE id=1',
        );
        if (attempts[index] === 1) {
          arrivals += 1;
          if (arrivals === 2) release();
          await barrier;
        }
        await client.query('UPDATE sprint003_retry_probe SET value=$1 WHERE id=1', [
          current.rows[0]!.value + 1,
        ]);
      }, 'SERIALIZABLE');
    await Promise.all([increment(0), increment(1)]);
    expect(
      (await pool.query<{ value: number }>('SELECT value FROM sprint003_retry_probe WHERE id=1'))
        .rows[0]!.value,
    ).toBe(2);
    expect(attempts.some((value) => value > 1)).toBe(true);
    await pool.query('DROP TABLE sprint003_retry_probe');
  });

  it('bloqueia desconexão durante criação/reconciliação e remove segredos somente após estado seguro', async () => {
    const impact = await fulfillment.getAsaasDisconnectImpact();
    expect(
      impact.pendingJobs + impact.creatingCharges + impact.unreconciledCharges,
    ).toBeGreaterThan(0);
    await expect(
      fulfillment.disconnectAsaas(actor(), 'disconnect-blocked', randomUUID()),
    ).rejects.toMatchObject({ code: 'ASAAS_DISCONNECT_BLOCKED' });
    while (await fulfillment.processOneOutbox('disconnect-drain')) {
      // drena jobs antes de encerrar a integração
    }
    await pool.query(
      `UPDATE payment_charges SET status='CANCELLED' WHERE status IN ('PENDING_CREATION','CREATED','CONFIRMED','OVERDUE')`,
    );
    const historyBefore = (
      await pool.query<{ count: number }>('SELECT count(*)::int count FROM payment_charges')
    ).rows[0]!.count;
    const disconnected = await fulfillment.disconnectAsaas(
      actor(),
      'disconnect-safe',
      randomUUID(),
    );
    expect(disconnected).toMatchObject({ status: 'DISCONNECTED', environment: 'SANDBOX' });
    const stored = await pool.query<{ apiKey: Buffer | null; webhook: Buffer | null }>(
      `SELECT api_key_ciphertext AS "apiKey",webhook_token_ciphertext AS webhook FROM asaas_connections WHERE status='DISCONNECTED' ORDER BY updated_at DESC LIMIT 1`,
    );
    expect(stored.rows[0]).toEqual({ apiKey: null, webhook: null });
    expect(
      (await pool.query<{ count: number }>('SELECT count(*)::int count FROM payment_charges'))
        .rows[0]!.count,
    ).toBe(historyBefore);
  });
});
