import { expect, test, type Page } from '@playwright/test';
import { configuredTestDatabasePolicy, verifyConnectedTestDatabase } from '@north/testing';
import pg from 'pg';

let verificationPool: pg.Pool;

test.beforeAll(async () => {
  const policy = configuredTestDatabasePolicy();
  verificationPool = new pg.Pool({ connectionString: policy.url, max: 1 });
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

test('fluxo vertical: gestor, funcionário, material, saldo, exceção, auditoria e revogação', async ({
  browser,
}) => {
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, 'gestor.e2e@example.test', 'E2ePassword123!');

  await managerPage.goto('/settings/users');
  await managerPage.getByLabel('Nome').fill('Funcionário E2E');
  await managerPage.getByLabel('E-mail').fill('employee.e2e@example.test');
  await managerPage.getByLabel('Senha inicial').fill('EmployeeE2ePassword123!');
  await managerPage.getByRole('button', { name: 'Criar funcionário' }).click();
  await expect(managerPage.getByText('Funcionário criado.')).toBeVisible();

  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  await login(employeePage, 'employee.e2e@example.test', 'EmployeeE2ePassword123!');
  await employeePage.getByRole('link', { name: 'Novo material' }).click();
  await employeePage.getByLabel('Código').fill('E2E-MAT-01');
  await employeePage.getByLabel('Nome').fill('Tecido E2E');
  await employeePage.getByLabel('Unidade-base').fill('m');
  await employeePage.getByLabel('Estoque mínimo').fill('2.5');
  await employeePage.getByRole('button', { name: 'Cadastrar material' }).click();
  await expect(employeePage).toHaveURL(/\/materials\/[0-9a-f-]+$/);
  const materialId = employeePage.url().split('/').at(-1)!;

  await employeePage.getByRole('link', { name: 'Registrar movimento' }).click();
  await employeePage.getByLabel('Tipo').selectOption('RECEIPT');
  await employeePage.getByLabel('Quantidade').fill('5.125001');
  await expect(employeePage.getByText('Depois (projeção)').locator('..')).toContainText(
    '5,125001 m',
  );
  await employeePage.getByRole('button', { name: 'Confirmar movimento' }).click();
  await expect(employeePage.getByText('Movimento registrado com sucesso.')).toBeVisible();
  await expect(employeePage).toHaveURL(new RegExp(`/materials/${materialId}$`));
  await expect(employeePage.getByText('5,125001 m').first()).toBeVisible();

  await employeePage.goto(`/materials/${materialId}/movement`);
  await employeePage.getByLabel('Tipo').selectOption('ADJUSTMENT_OUT');
  await employeePage.getByLabel('Quantidade').fill('10');
  await employeePage.getByLabel(/Motivo/).fill('Tentativa operacional');
  await employeePage.getByLabel(/Confirmo a exceção/).check();
  await employeePage.getByRole('button', { name: 'Confirmar movimento' }).click();
  await expect(
    employeePage.getByRole('alert').filter({ hasText: 'Somente um gestor' }),
  ).toBeVisible();

  await managerPage.goto(`/materials/${materialId}/movement`);
  await managerPage.getByLabel('Tipo').selectOption('ADJUSTMENT_OUT');
  await managerPage.getByLabel('Quantidade').fill('10');
  await managerPage.getByLabel(/Motivo/).fill('Inventário físico conferido pelo gestor');
  await managerPage.getByLabel(/Confirmo a exceção/).check();
  await managerPage.getByRole('button', { name: 'Confirmar movimento' }).click();
  await expect(managerPage.getByText('Movimento registrado com sucesso.')).toBeVisible();

  await managerPage.goto('/audit');
  await expect(managerPage.getByRole('heading', { name: 'Auditoria operacional' })).toBeVisible();
  await expect(managerPage.getByText('INVENTORY_MOVEMENT_CREATED').first()).toBeVisible();
  await managerPage.screenshot({
    path: 'docs/erp/evidence/sprint-001-audit.png',
    fullPage: true,
  });

  await managerPage.goto('/settings/users');
  const employeeRow = managerPage.getByRole('row').filter({ hasText: 'employee.e2e@example.test' });
  await employeeRow.getByRole('button', { name: 'Desativar' }).click();
  await expect(employeeRow).toContainText('DISABLED');

  await employeePage.goto('/materials');
  await expect(employeePage).toHaveURL(/\/login$/);

  await employeeContext.close();
  await managerContext.close();
});
