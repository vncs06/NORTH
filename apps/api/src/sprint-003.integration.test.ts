import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@north/auth';
import { pool } from '@north/database';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from '@north/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './main.js';
import { FulfillmentRepository } from './fulfillment-repository.js';
import { NorthRepository } from './repository.js';

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

  beforeAll(async () => {
    await expect(verifyConnectedTestDatabase(pool, configuredTestDatabasePolicy())).resolves.toBe(
      'north_test',
    );
    const installation = await pool.query('SELECT id FROM installation');
    if (!installation.rows[0]) {
      await north.bootstrap({
        companyName: 'Empresa S3',
        timezone: 'America/Manaus',
        managerName: 'Gestor S3',
        managerEmail: 'gestor.s3@example.test',
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
      .send({ rateBps: 5000, minimumAmountCents: 0, effectiveAt: new Date().toISOString() })
      .expect(403);
    await agent.get('/api/v1/orders').expect(200);
  });

  it('versiona política, rejeita chave idempotente divergente e converte snapshot emitido', async () => {
    const input = { rateBps: 5000, minimumAmountCents: 0, effectiveAt: new Date().toISOString() };
    await fulfillment.putDepositPolicy(actor(), input, 'policy-s3', randomUUID());
    await expect(
      fulfillment.putDepositPolicy(actor(), { ...input, rateBps: 4000 }, 'policy-s3', randomUUID()),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const [order, replay] = await Promise.all([
      fulfillment.convertQuote(actor(), quoteId, 'convert-s3', randomUUID()),
      fulfillment.convertQuote(actor(), quoteId, 'convert-s3', randomUUID()),
    ]);
    orderId = order.id as string;
    expect(replay.id).toBe(orderId);
    expect(order).toMatchObject({ depositAmountCents: '5000', totalAmountCents: '10000' });
    const balance = await pool.query(
      `SELECT physical_quantity::text physical,reserved_quantity::text reserved
      FROM inventory_balances WHERE material_id=$1`,
      [materialId],
    );
    expect(balance.rows[0]).toEqual({ physical: '10.000000', reserved: '0.000000' });
  });

  it('protege documento, segredos e persiste webhook idempotente antes do processamento', async () => {
    const order = await fulfillment.getOrder(orderId);
    await fulfillment.putBillingDocument(actor(), order.customerId, '52998224725', randomUUID());
    await fulfillment.configureAsaas(
      actor(),
      {
        environment: 'SANDBOX',
        apiKey: 'stub-sandbox-api-key-000000000000',
        webhookAuthToken: 'stub-webhook-token-000000000000000000000',
        webhookPublicUrl: 'https://example.test/api/v1/webhooks/asaas/payments',
      },
      'asaas-s3',
      randomUUID(),
    );
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
    await fulfillment.confirmArtwork(
      actor(),
      orderId,
      artworkId,
      'cliente confirmou externamente',
      'confirm-s3',
      randomUUID(),
    );
    order = await fulfillment.approveArtwork(
      actor(),
      orderId,
      artworkId,
      'evidência conferida',
      'approve-s3',
      randomUUID(),
    );
    expect(order.readiness.blockers).toContain('DEPOSIT_NOT_CONFIRMED');
    order = await fulfillment.approveFinancialException(
      actor(),
      orderId,
      'Sinal dispensado pelo gestor para este pedido.',
      'financial-s3',
      randomUUID(),
    );
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
  });

  it('cancela sem apagar histórico, libera reserva por movimento inverso e não cria estorno automático', async () => {
    const cancelled = await fulfillment.cancelOrder(
      actor(),
      orderId,
      'Cliente cancelou antes da produção.',
      'cancel-s3',
      randomUUID(),
    );
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
});
