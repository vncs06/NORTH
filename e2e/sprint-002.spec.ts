import { expect, test, type Page } from '@playwright/test';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from '@north/testing';
import pg from 'pg';

let verificationPool: pg.Pool;

test.beforeAll(async () => {
  const policy = configuredTestDatabasePolicy();
  verificationPool = new pg.Pool({ connectionString: policy.url, max: 2 });
  await expect(verifyConnectedTestDatabase(verificationPool, policy)).resolves.toBe('north_test');
});

test.afterAll(async () => {
  await verificationPool.end();
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/materials$/);
}

test('fluxo vertical: catálogo, ficha, preço, orçamento emitido e revisão', async ({ browser }) => {
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, 'gestor.e2e@example.test', 'E2ePassword123!');

  await managerPage.goto('/settings/users');
  await managerPage.getByLabel('Nome').fill('Orçamentista E2E');
  await managerPage.getByLabel('E-mail').fill('quotes.e2e@example.test');
  await managerPage.getByLabel('Senha inicial').fill('QuotesE2ePassword123!');
  await managerPage.getByRole('button', { name: 'Criar funcionário' }).click();
  await expect(managerPage.getByText('Funcionário criado.')).toBeVisible();

  await managerPage.goto('/materials/new');
  await managerPage.getByLabel('Código').fill('E2E-CANECA-325');
  await managerPage.getByLabel('Nome').fill('Caneca branca E2E');
  await managerPage.getByLabel('Unidade-base').fill('un');
  await managerPage.getByLabel('Estoque mínimo').fill('0');
  await managerPage.getByRole('button', { name: 'Cadastrar material' }).click();
  await expect(managerPage).toHaveURL(/\/materials\/[0-9a-f-]+$/);
  const materialId = managerPage.url().split('/').at(-1)!;
  await managerPage.getByLabel('Valor unitário (R$)').fill('10.00');
  await managerPage.getByLabel('Motivo (opcional)').fill('Custo inicial E2E');
  await managerPage.getByRole('button', { name: 'Registrar custo' }).click();
  await expect(managerPage.getByText('Novo custo vigente registrado')).toBeVisible();

  await managerPage.goto(`/materials/${materialId}/movement`);
  await managerPage.getByLabel('Tipo').selectOption('OPENING_BALANCE');
  await managerPage.getByLabel('Quantidade').fill('2');
  await managerPage.getByRole('button', { name: 'Confirmar movimento' }).click();
  await expect(managerPage.getByText('Movimento registrado com sucesso.')).toBeVisible();

  await managerPage.goto('/catalog');
  const productForm = managerPage.locator('form').filter({ hasText: 'Produto' }).first();
  await productForm.getByLabel('Código').fill('E2E-CANECA');
  await productForm.getByLabel('Nome').fill('Caneca personalizada E2E');
  await productForm.getByRole('button', { name: 'Criar produto' }).click();
  await expect(managerPage.getByText('Cadastro salvo e auditado.')).toBeVisible();

  const variantForm = managerPage.locator('form').filter({ hasText: 'Variante' }).first();
  await variantForm.getByLabel('Código').fill('E2E-325ML');
  await variantForm.getByLabel('Nome').fill('Branca 325 ml E2E');
  await variantForm.getByRole('button', { name: 'Criar variante' }).click();
  await expect(managerPage.getByText('Cadastro salvo e auditado.')).toBeVisible();

  const techniqueForm = managerPage.locator('form').filter({ hasText: 'Técnica' }).first();
  await techniqueForm.getByLabel('Código').fill('E2E-SUB');
  await techniqueForm.getByLabel('Nome').fill('Sublimação E2E');
  await techniqueForm.getByRole('button', { name: 'Criar técnica' }).click();
  await expect(managerPage.getByText('Cadastro salvo e auditado.')).toBeVisible();
  await managerPage.getByRole('button', { name: 'Criar combinação' }).click();
  await expect(managerPage.getByText('Combinação válida criada.')).toBeVisible();

  await managerPage.goto('/technical-sheets');
  await managerPage.getByLabel('Rendimento da ficha').fill('1');
  await managerPage.getByLabel('Perda prevista (pontos-base)').fill('500');
  await managerPage.getByLabel('Quantidade 1').fill('1');
  await managerPage.getByRole('button', { name: 'Criar ficha em rascunho' }).click();
  await expect(managerPage.getByText(/Ficha v1 criada/)).toBeVisible();
  await managerPage.getByRole('button', { name: 'Ativar' }).click();
  await expect(managerPage.getByText(/Ficha v1 ativada/)).toBeVisible();

  await managerPage.goto('/pricing');
  await managerPage.getByLabel('Método').selectOption('MARKUP');
  await managerPage.getByLabel('Percentual (pontos-base)').fill('5000');
  await managerPage.getByLabel(/Limite de desconto do funcionário/).fill('500');
  await managerPage.getByLabel('Limite gerencial (bps)').fill('1500');
  await managerPage.getByLabel(/Opções de desconto/).fill('0,500,1000,1500');
  await managerPage.getByLabel('Valor (R$)').fill('2.00');
  await managerPage.getByRole('button', { name: 'Ativar nova política' }).click();
  await expect(managerPage.getByText(/Política v1 ativada/)).toBeVisible();

  await managerPage.goto('/customers');
  await managerPage.getByLabel('Nome de exibição').fill('Cliente PF E2E');
  await managerPage.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(managerPage.getByText('Cliente Cliente PF E2E cadastrado.')).toBeVisible();

  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  await login(employeePage, 'quotes.e2e@example.test', 'QuotesE2ePassword123!');
  await employeePage.goto('/quotes');
  await employeePage.getByLabel('Cliente').selectOption({ label: 'Cliente PF E2E' });
  await employeePage.getByLabel('Quantidade').fill('3');
  await employeePage.getByRole('button', { name: 'Criar e simular' }).click();
  await expect(employeePage).toHaveURL(/\/quotes\/[0-9a-f-]+$/);
  await employeePage.getByLabel('Desconto (pontos-base)').selectOption('500');
  await employeePage.getByRole('button', { name: 'Simular composição' }).click();
  await expect(
    employeePage.getByRole('heading', { name: 'Consumo previsto e disponibilidade' }),
  ).toBeVisible();
  await expect(employeePage.getByText('saldo insuficiente')).toBeVisible();
  await expect(employeePage.getByText('R$ 53,44')).toBeVisible();

  const stockBefore = await verificationPool.query(
    `SELECT reserved_quantity::text AS reserved,
            (SELECT count(*)::int FROM inventory_movements WHERE material_id=$1) AS movements
     FROM inventory_balances WHERE material_id=$1`,
    [materialId],
  );
  await employeePage.getByRole('button', { name: 'Emitir orçamento' }).click();
  await expect(
    employeePage.getByText('Orçamento emitido. O snapshot agora é imutável.'),
  ).toBeVisible();
  const issuedUrl = employeePage.url();
  await employeePage.screenshot({
    path: 'docs/erp/evidence/sprint-002-issued-quote.png',
    fullPage: true,
  });
  const stockAfter = await verificationPool.query(
    `SELECT reserved_quantity::text AS reserved,
            (SELECT count(*)::int FROM inventory_movements WHERE material_id=$1) AS movements
     FROM inventory_balances WHERE material_id=$1`,
    [materialId],
  );
  expect(stockAfter.rows[0]).toEqual(stockBefore.rows[0]);

  await managerPage.goto(`/materials/${materialId}`);
  await managerPage.getByLabel('Valor unitário (R$)').fill('14.00');
  await managerPage.getByLabel('Motivo (opcional)').fill('Novo custo para revisão');
  await managerPage.getByRole('button', { name: 'Registrar custo' }).click();
  await expect(managerPage.getByText('Novo custo vigente registrado')).toBeVisible();
  await managerPage.goto('/pricing');
  await managerPage.getByLabel('Método').selectOption('MARGIN');
  await managerPage.getByLabel('Percentual (pontos-base)').fill('4000');
  await managerPage.getByLabel(/Limite de desconto do funcionário/).fill('300');
  await managerPage.getByLabel(/Opções de desconto/).fill('0,300,1000,1500');
  await managerPage.getByRole('button', { name: 'Ativar nova política' }).click();
  await expect(managerPage.getByText(/Política v2 ativada/)).toBeVisible();

  await employeePage.goto(issuedUrl);
  await expect(employeePage.getByText('R$ 53,44')).toBeVisible();
  await employeePage.getByRole('button', { name: 'Criar revisão explícita' }).click();
  await expect(employeePage).toHaveURL(/\/quotes\/[0-9a-f-]+$/);
  await employeePage.getByLabel('Desconto (pontos-base)').selectOption('300');
  await employeePage.getByRole('button', { name: 'Simular composição' }).click();
  await expect(employeePage.getByText('Revisão anterior:')).toBeVisible();
  await expect(employeePage.getByText('R$ 44,10').first()).toBeVisible();
  await employeePage.getByRole('button', { name: 'Emitir orçamento' }).click();
  await expect(
    employeePage.getByText('Orçamento emitido. O snapshot agora é imutável.'),
  ).toBeVisible();

  await managerPage.goto('/audit');
  await expect(managerPage.getByText('QUOTE_ISSUED').first()).toBeVisible();
  await expect(managerPage.getByText('QUOTE_REVISION_CREATED').first()).toBeVisible();

  await employeeContext.close();
  await managerContext.close();
});
