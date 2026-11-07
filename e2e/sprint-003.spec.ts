import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { FulfillmentRepository } from '../apps/api/src/fulfillment-repository.js';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from '@north/testing';
import pg from 'pg';

let verificationPool: pg.Pool;
const worker = new FulfillmentRepository();
const webhookToken = 'e2e-webhook-token-0000000000000000000000';

test.beforeAll(async () => {
  const policy = configuredTestDatabasePolicy();
  verificationPool = new pg.Pool({ connectionString: policy.url, max: 2 });
  await expect(verifyConnectedTestDatabase(verificationPool, policy)).resolves.toBe('north_test');
});
test.afterAll(async () => {
  await verificationPool.end();
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/materials$/);
}

test('fluxo vertical: pedido, sinal, arte, webhook e reserva; mais exceção de saldo', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await login(manager, 'gestor.e2e@example.test', 'E2ePassword123!');

  await manager.goto('/settings/orders');
  await manager.getByLabel('Percentual do sinal (pontos-base)').fill('5000');
  await manager.getByRole('button', { name: 'Ativar nova versão' }).click();
  await expect(manager.getByText('Política de sinal versionada e ativada.')).toBeVisible();
  await manager.getByLabel('API key Sandbox').fill('stub-sandbox-api-key-000000000000');
  await manager.getByLabel('Token do webhook').fill(webhookToken);
  await manager
    .getByLabel('URL pública HTTPS do webhook')
    .fill('https://north.example.test/api/v1/webhooks/asaas/payments');
  await manager.getByRole('button', { name: 'Salvar conexão cifrada' }).click();
  await expect(manager.getByText('Conexão Sandbox armazenada de forma cifrada.')).toBeVisible();
  await manager.getByRole('button', { name: 'Ativar política versionada' }).click();
  await expect(manager.getByText('Política de absorção/repasse versionada.')).toBeVisible();

  const issued = await verificationPool.query<{ quoteId: string; materialId: string }>(
    `SELECT q.id AS "quoteId",qm.material_id AS "materialId" FROM quotes q
     JOIN quote_items qi ON qi.quote_id=q.id JOIN quote_material_snapshots qm ON qm.quote_item_id=qi.id
     WHERE q.status='ISSUED' ORDER BY q.issued_at LIMIT 1`,
  );
  const quoteId = issued.rows[0]!.quoteId;
  const materialId = issued.rows[0]!.materialId;
  await manager.goto(`/materials/${materialId}/movement`);
  await manager.getByLabel('Tipo').selectOption('RECEIPT');
  await manager.getByLabel('Quantidade').fill('100');
  await manager.getByRole('button', { name: 'Confirmar movimento' }).click();
  await expect(manager.getByText('Movimento registrado com sucesso.')).toBeVisible();
  const before = await verificationPool.query(
    `SELECT physical_quantity::text physical,
    reserved_quantity::text reserved FROM inventory_balances WHERE material_id=$1`,
    [materialId],
  );

  const employeeContext = await browser.newContext();
  const employee = await employeeContext.newPage();
  await login(employee, 'quotes.e2e@example.test', 'QuotesE2ePassword123!');
  await employee.goto('/orders');
  const quote = await verificationPool.query<{ number: string }>(
    'SELECT commercial_number AS number FROM quotes WHERE id=$1',
    [quoteId],
  );
  await employee
    .getByRole('button', { name: new RegExp(`Converter ${quote.rows[0]!.number}`) })
    .click();
  await expect(employee).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  const orderId = employee.url().split('/').at(-1)!;

  await employee.getByLabel('CPF/CNPJ').fill('529.982.247-25');
  await employee.getByRole('button', { name: 'Salvar protegido' }).click();
  await expect(employee.getByText(/Documento protegido configurado/)).toBeVisible();
  await employee.getByLabel('Meio').selectOption('PIX');
  await employee.getByLabel('Vencimento').fill('2026-12-31');
  await employee.getByRole('button', { name: 'Enfileirar no Asaas' }).click();
  await expect(employee.getByText('Operação registrada e prontidão reavaliada.')).toBeVisible();
  expect(await worker.processOneOutbox('e2e-worker')).toBe(true);
  await employee.reload();
  await expect(employee.getByText(/PIX ·/)).toBeVisible();

  const orderResponse = await employee.request.get(
    `http://localhost:3101/api/v1/orders/${orderId}`,
  );
  const order = (await orderResponse.json()) as { charges: Array<{ externalChargeId: string }> };
  const externalChargeId = order.charges[0]!.externalChargeId;
  const webhook = await employee.request.post(
    'http://localhost:3101/api/v1/webhooks/asaas/payments',
    {
      headers: { 'asaas-access-token': webhookToken },
      data: {
        id: `evt_${randomUUID()}`,
        event: 'PAYMENT_CONFIRMED',
        payment: { id: externalChargeId, value: 26.72 },
      },
    },
  );
  expect(webhook.status()).toBe(200);
  expect(await worker.processOneWebhook('e2e-worker')).toBe(true);

  await employee.reload();
  await employee.getByLabel('Arquivo da arte').setInputFiles({
    name: 'arte-e2e.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await employee.getByRole('button', { name: 'Enviar arte' }).click();
  await expect(employee.getByText('Nova versão da arte armazenada privadamente.')).toBeVisible();
  await employee.getByRole('button', { name: 'Solicitar aprovação do cliente' }).click();
  await employee.getByRole('button', { name: 'Registrar confirmação externa' }).click();
  await expect(employee.getByText('Operação registrada e prontidão reavaliada.')).toBeVisible();

  await manager.goto(`/orders/${orderId}`);
  await manager.getByRole('button', { name: 'Aprovar como gestor' }).click();
  await expect(manager.getByText('Prontidão confirmada.')).toBeVisible();
  await expect(manager.getByText('READY_FOR_PRODUCTION').first()).toBeVisible();
  const after = await verificationPool.query(
    `SELECT physical_quantity::text physical,
    reserved_quantity::text reserved FROM inventory_balances WHERE material_id=$1`,
    [materialId],
  );
  expect(after.rows[0].physical).toBe(before.rows[0].physical);
  expect(Number(after.rows[0].reserved)).toBeGreaterThan(Number(before.rows[0].reserved));
  await manager.screenshot({
    path: 'docs/erp/evidence/sprint-003-ready-order.png',
    fullPage: true,
  });

  await manager.goto('/settings/orders');
  await manager.getByLabel('Modo').selectOption('FIXED_AMOUNT');
  await manager.getByLabel('Valor fixo (R$)').fill('50');
  await manager.getByRole('button', { name: 'Ativar nova versão' }).click();
  await expect(manager.getByText('Política de sinal versionada e ativada.')).toBeVisible();

  const original = await verificationPool.query<{
    customerId: string;
    combinationId: string;
    sheetId: string;
    costId: string;
  }>(
    `SELECT q.customer_id AS "customerId",qi.combination_id AS "combinationId",
    qi.technical_sheet_id AS "sheetId",qm.material_cost_id AS "costId"
    FROM quotes q JOIN quote_items qi ON qi.quote_id=q.id
    JOIN quote_material_snapshots qm ON qm.quote_item_id=qi.id WHERE q.id=$1`,
    [quoteId],
  );
  const shortageQuote = randomUUID();
  const shortageItem = randomUUID();
  await verificationPool.query(
    `INSERT INTO quotes(id,commercial_number,revision_number,root_quote_id,customer_id,status,final_price_cents,
      customer_display_name_snapshot,created_by,updated_by,issued_by,issued_at)
    SELECT $1,$2,1,$1,$3,'ISSUED',30000,'Cliente PF E2E',id,id,id,clock_timestamp()
    FROM users WHERE role='MANAGER' ORDER BY created_at LIMIT 1`,
    [shortageQuote, `ORC-E2E-${shortageQuote.slice(0, 6)}`, original.rows[0]!.customerId],
  );
  await verificationPool.query(
    `INSERT INTO quote_items(id,quote_id,combination_id,requested_quantity,display_order,product_code_snapshot,
      product_name_snapshot,variant_code_snapshot,variant_name_snapshot,technique_code_snapshot,
      technique_name_snapshot,technical_sheet_id,technical_sheet_version,yield_quantity_snapshot,
      loss_bps_snapshot,material_cost_cents,insufficient_stock)
    VALUES($1,$2,$3,1,0,'P-E2E','Produto falta','V-E2E','Variante','T-E2E','Técnica',$4,1,1,0,200000,true)`,
    [shortageItem, shortageQuote, original.rows[0]!.combinationId, original.rows[0]!.sheetId],
  );
  await verificationPool.query(
    `INSERT INTO quote_material_snapshots(id,quote_item_id,material_id,material_code,material_name,unit,
      component_quantity,base_consumption,loss_quantity,total_consumption,loss_bps,unit_cost_cents,
      total_cost_cents,physical_quantity,reserved_quantity,available_quantity,insufficient_stock,material_cost_id)
    SELECT $1,$2,$3,m.code,m.name,m.base_unit,1000,1000,0,1000,0,100,100000,
      b.physical_quantity,b.reserved_quantity,b.physical_quantity-b.reserved_quantity,true,$4
    FROM materials m JOIN inventory_balances b ON b.material_id=m.id WHERE m.id=$3`,
    [randomUUID(), shortageItem, materialId, original.rows[0]!.costId],
  );
  await employee.goto('/orders');
  await employee
    .getByRole('button', { name: new RegExp(`Converter ORC-E2E-${shortageQuote.slice(0, 6)}`) })
    .click();
  await expect(employee).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  const shortageOrderId = employee.url().split('/').at(-1)!;
  await employee.getByLabel('Meio').selectOption('CREDIT_CARD');
  await employee.getByLabel('Vencimento').fill('2026-12-31');
  await employee.getByRole('button', { name: 'Enfileirar no Asaas' }).click();
  await expect(employee.getByText('Operação registrada e prontidão reavaliada.')).toBeVisible();
  expect(await worker.processOneOutbox('e2e-card-worker')).toBe(true);
  await employee.reload();
  await expect(
    employee.getByRole('link', { name: 'abrir experiência hospedada do Asaas' }),
  ).toBeVisible();
  await employee.getByLabel('Arquivo da arte').setInputFiles({
    name: 'arte-falta.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await employee.getByRole('button', { name: 'Enviar arte' }).click();
  await employee.getByRole('button', { name: 'Solicitar aprovação do cliente' }).click();
  await manager.goto(`/orders/${shortageOrderId}`);
  manager.once('dialog', (dialog) =>
    dialog.accept('Cliente rejeitou a primeira versão no canal externo.'),
  );
  await manager.getByRole('button', { name: 'Registrar rejeição confirmada' }).click();
  await expect(manager.getByText('REJECTED')).toBeVisible();
  await employee.goto(`/orders/${shortageOrderId}`);
  await employee.getByLabel('Arquivo da arte').setInputFiles({
    name: 'arte-falta-revisada.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await employee.getByRole('button', { name: 'Enviar arte' }).click();
  await employee.getByRole('button', { name: 'Solicitar aprovação do cliente' }).click();
  await employee.getByRole('button', { name: 'Registrar confirmação externa' }).click();
  await manager.goto(`/orders/${shortageOrderId}`);
  await manager.getByRole('button', { name: 'Aprovar como gestor' }).click();
  await manager
    .getByRole('heading', { name: 'Exceção financeira gerencial' })
    .locator('..')
    .getByRole('textbox')
    .fill('Sinal dispensado no cenário E2E.');
  await manager.getByRole('button', { name: 'Aprovar com motivo' }).click();
  await expect(manager.getByText(/INSUFFICIENT_STOCK/)).toBeVisible();
  const reserveForm = manager.getByRole('heading', { name: 'Reavaliar reserva' }).locator('..');
  await reserveForm.getByRole('checkbox').check();
  await reserveForm
    .getByPlaceholder('Motivo, se houver exceção')
    .fill('Compra emergencial autorizada.');
  await reserveForm.getByRole('button', { name: 'Reavaliar' }).click();
  await expect(manager.getByText('READY_FOR_PRODUCTION').first()).toBeVisible();

  await manager.goto('/settings/orders');
  await manager.getByLabel('Nova API key').fill('stub-rotated-api-key-000000000000');
  await manager.getByRole('button', { name: 'Validar e rotacionar' }).click();
  await expect(manager.getByText(/Nova chave validada e ativada/)).toBeVisible();
  await verificationPool.query(
    `UPDATE payment_charges SET status='CANCELLED' WHERE status IN ('PENDING_CREATION','CREATED','CONFIRMED','OVERDUE')`,
  );
  manager.once('dialog', (dialog) => dialog.accept());
  await manager.getByRole('button', { name: 'Analisar impacto e desconectar' }).click();
  await expect(manager.getByText(/Integração desconectada/)).toBeVisible();

  await employeeContext.close();
  await managerContext.close();
});
