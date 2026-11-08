import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '@north/domain';
import { assertAsaasApiKeyEnvironment, assertHostedInvoiceUrl } from '@north/domain/fulfillment';

export interface EncryptedValue {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

export function assertSecretConfigurationOnStartup(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.NORTH_SECRET_MASTER_KEY) {
    throw new Error('NORTH_SECRET_MASTER_KEY_REQUIRED_OUTSIDE_LOCAL');
  }
  if (process.env.NODE_ENV !== 'test' && process.env.ASAAS_BASE_URL) {
    throw new Error('ASAAS_BASE_URL_OVERRIDE_NOT_ALLOWED');
  }
}

function masterKey(): Buffer {
  const raw = process.env.NORTH_SECRET_MASTER_KEY;
  if (!raw) {
    throw new DomainError(
      'SECRET_MASTER_KEY_MISSING',
      'A chave mestra de segredos não está configurada.',
      503,
    );
  }
  const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new DomainError(
      'SECRET_MASTER_KEY_INVALID',
      'A chave mestra de segredos deve possuir 32 bytes.',
      503,
    );
  }
  return key;
}

export function encryptSecret(value: string, context: string): EncryptedValue {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), nonce);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

export function decryptSecret(value: EncryptedValue, context: string): string {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), value.nonce);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(value.authTag);
  return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8');
}

export function protectedHash(value: string, context: string): string {
  return createHmac('sha256', masterKey()).update(`${context}\0${value}`).digest('hex');
}

export function shortFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function generateWebhookAuthToken(): string {
  return `whsec_${randomBytes(36).toString('base64url')}`;
}

export const ASAAS_WEBHOOK_PATH = '/api/v1/webhooks/asaas/payments';

export function configuredAsaasWebhookUrl(): string {
  const configured = process.env.NORTH_PUBLIC_BASE_URL?.trim();
  if (!configured) {
    throw new DomainError(
      'NORTH_PUBLIC_BASE_URL_MISSING',
      'A URL pública confiável da instalação precisa ser configurada antes de conectar o Asaas.',
      422,
    );
  }
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new DomainError(
      'NORTH_PUBLIC_BASE_URL_INVALID',
      'A URL pública da instalação é inválida.',
      422,
    );
  }
  const local = ['localhost', '127.0.0.1'].includes(base.hostname);
  if ((!local || process.env.NODE_ENV === 'production') && base.protocol !== 'https:') {
    throw new DomainError(
      'NORTH_PUBLIC_BASE_URL_HTTPS_REQUIRED',
      'A URL pública da instalação deve usar HTTPS.',
      422,
    );
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new DomainError(
      'NORTH_PUBLIC_BASE_URL_UNSAFE',
      'A URL pública não pode conter credenciais, query string ou fragmento.',
      422,
    );
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}${ASAAS_WEBHOOK_PATH}`;
  return base.toString();
}

export function optionalAsaasWebhookUrl(): string | null {
  try {
    return configuredAsaasWebhookUrl();
  } catch (error) {
    if (error instanceof DomainError && error.code.startsWith('NORTH_PUBLIC_BASE_URL_'))
      return null;
    throw error;
  }
}

function objectRoot(): string {
  return path.resolve(
    process.env.OBJECT_STORAGE_ROOT ?? path.join(process.cwd(), '.north-private-files'),
  );
}

export class PrivateObjectStorage {
  async put(key: string, content: Buffer): Promise<void> {
    const root = objectRoot();
    const target = path.resolve(root, key);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('INVALID_STORAGE_KEY');
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  }

  async get(key: string): Promise<Buffer> {
    const root = objectRoot();
    const target = path.resolve(root, key);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('INVALID_STORAGE_KEY');
    return readFile(target);
  }

  async remove(key: string): Promise<void> {
    const root = objectRoot();
    const target = path.resolve(root, key);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('INVALID_STORAGE_KEY');
    await rm(target, { force: true });
  }
}

export interface AsaasCustomerRequest {
  name: string;
  cpfCnpj: string;
  externalReference: string;
  notificationDisabled: boolean;
}

export interface AsaasChargeRequest {
  customer: string;
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  value: number;
  dueDate: string;
  externalReference: string;
}

export class AsaasGateway {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly environment: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX',
  ) {
    assertAsaasApiKeyEnvironment(apiKey, environment);
    const configured = process.env.ASAAS_BASE_URL;
    if (configured && process.env.NODE_ENV !== 'test') {
      throw new Error('ASAAS_BASE_URL_OVERRIDE_NOT_ALLOWED');
    }
    this.baseUrl =
      configured ??
      (environment === 'SANDBOX' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');
  }

  private async request<T>(pathname: string, init: RequestInit, attempts = 1): Promise<T> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        access_token: this.apiKey,
        'user-agent': 'NORTH-ERP/0.1',
        ...(init.headers as Record<string, string> | undefined),
      };
      if (process.env.NODE_ENV === 'test' && process.env.ASAAS_STUB_SCENARIO) {
        headers['x-stub-scenario'] = process.env.ASAAS_STUB_SCENARIO;
      }
      if (process.env.NODE_ENV === 'test') {
        headers['x-north-asaas-environment'] = this.environment;
      }
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      response = await fetch(`${this.baseUrl}${pathname}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (attempts > 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.request(pathname, init, attempts - 1);
      }
      throw new DomainError(
        'ASAAS_TIMEOUT',
        'O Asaas não respondeu dentro do tempo esperado.',
        504,
        { cause: error instanceof Error ? error.name : 'network' },
      );
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempts > 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.request(pathname, init, attempts - 1);
      }
      const code =
        response.status === 401
          ? 'ASAAS_INVALID_API_KEY'
          : response.status === 403
            ? 'ASAAS_ACCESS_FORBIDDEN'
            : response.status === 429
              ? 'ASAAS_RATE_LIMITED'
              : response.status >= 500
                ? 'ASAAS_UNAVAILABLE'
                : 'ASAAS_REQUEST_REJECTED';
      throw new DomainError(code, 'O Asaas recusou ou não concluiu a operação.', 502, {
        providerStatus: response.status,
      });
    }
    return (await response.json()) as T;
  }

  createCustomer(input: AsaasCustomerRequest): Promise<{ id: string }> {
    return this.request('/customers', { method: 'POST', body: JSON.stringify(input) });
  }

  getCustomer(id: string): Promise<{ id: string }> {
    return this.request(`/customers/${encodeURIComponent(id)}`, { method: 'GET' }, 3);
  }

  findCustomers(externalReference: string): Promise<{ data: Array<{ id: string }> }> {
    return this.request(
      `/customers?externalReference=${encodeURIComponent(externalReference)}`,
      { method: 'GET' },
      3,
    );
  }

  createCharge(input: AsaasChargeRequest): Promise<{
    id: string;
    status: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
  }> {
    return this.request('/payments', { method: 'POST', body: JSON.stringify(input) });
  }

  getCharge(id: string): Promise<{ id: string; status: string; invoiceUrl?: string }> {
    return this.request(`/payments/${encodeURIComponent(id)}`, { method: 'GET' }, 3);
  }

  findCharges(externalReference: string): Promise<{
    data: Array<{ id: string; status: string; invoiceUrl?: string }>;
  }> {
    return this.request(
      `/payments?externalReference=${encodeURIComponent(externalReference)}`,
      { method: 'GET' },
      3,
    );
  }

  getFees(): Promise<Record<string, unknown>> {
    return this.request('/myAccount/fees/', { method: 'GET' }, 3);
  }

  createWebhook(input: {
    name: string;
    url: string;
    email: string;
    enabled: boolean;
    interrupted: boolean;
    apiVersion: number;
    authToken: string;
    sendType: 'SEQUENTIALLY';
    events: string[];
  }): Promise<{ id: string }> {
    return this.request('/webhooks', { method: 'POST', body: JSON.stringify(input) });
  }

  updateWebhook(
    id: string,
    input: {
      name: string;
      url: string;
      email: string;
      enabled: boolean;
      interrupted: boolean;
      apiVersion: number;
      authToken: string;
      sendType: 'SEQUENTIALLY';
      events: string[];
    },
  ): Promise<{ id: string }> {
    return this.request(`/webhooks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  listWebhooks(): Promise<{
    data: Array<{ id: string; name?: string; url?: string; enabled?: boolean }>;
  }> {
    return this.request('/webhooks', { method: 'GET' }, 3);
  }

  deleteWebhook(id: string): Promise<void> {
    return this.request(`/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' }, 3);
  }
}

function decimalToInteger(value: unknown, scale: number): number {
  const text =
    typeof value === 'number' ? value.toString() : typeof value === 'string' ? value : '0';
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return 0;
  const decimals = Math.log10(scale);
  const fraction = (match[2] ?? '').padEnd(decimals + 1, '0');
  const base = BigInt(match[1]!) * BigInt(scale) + BigInt(fraction.slice(0, decimals) || '0');
  const rounded = Number(fraction[decimals] ?? '0') >= 5 ? base + 1n : base;
  return Number(rounded);
}

export interface NormalizedAsaasFee {
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  fixedFeeCents: number;
  percentageBps: number;
  settlementDays: number | null;
  conditions: Record<string, unknown>;
}

export function normalizeAsaasFees(payload: Record<string, unknown>): NormalizedAsaasFee[] {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const payment = object(payload.payment);
  const pix = object(payment.pix ?? payload.pix ?? payload.pixCreditFee);
  const boleto = object(
    payment.bankSlip ?? payload.bankSlip ?? payload.bankSlipFee ?? payload.boleto,
  );
  const card = object(payment.creditCard ?? payload.creditCard ?? payload.creditCardFee);
  const item = (
    billingType: NormalizedAsaasFee['billingType'],
    source: Record<string, unknown>,
  ): NormalizedAsaasFee => ({
    billingType,
    fixedFeeCents: decimalToInteger(
      source.fixedValue ??
        source.fixedFeeValue ??
        source.defaultValue ??
        source.operationValue ??
        source.value ??
        source.fee ??
        source.fixedFee ??
        0,
      100,
    ),
    percentageBps: decimalToInteger(
      source.percentage ??
        source.oneInstallmentPercentage ??
        source.percent ??
        source.percentageFee ??
        0,
      100,
    ),
    settlementDays:
      typeof (source.settlementDays ?? source.days) === 'number'
        ? Number(source.settlementDays ?? source.days)
        : null,
    conditions: Object.fromEntries(
      Object.entries(source).filter(([key]) => !/token|key|secret|authorization/i.test(key)),
    ),
  });
  return [item('PIX', pix), item('BOLETO', boleto), item('CREDIT_CARD', card)];
}

export function safeHostedInvoiceUrl(
  value: string | undefined,
  environment: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX',
): string | null {
  return value ? assertHostedInvoiceUrl(value, environment) : null;
}

export function validateArtworkContent(mimeType: string, content: Buffer): void {
  const valid =
    (mimeType === 'image/png' &&
      content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
    (mimeType === 'image/jpeg' && content.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) ||
    (mimeType === 'application/pdf' && content.subarray(0, 5).toString('ascii') === '%PDF-');
  if (!valid) {
    throw new DomainError(
      'INVALID_ARTWORK_CONTENT',
      'O conteúdo não corresponde ao tipo de arquivo.',
      422,
    );
  }
  const maximum = Number(process.env.ARTWORK_MAX_BYTES ?? 26_214_400);
  if (content.length === 0 || content.length > maximum || maximum > 26_214_400) {
    throw new DomainError('ARTWORK_SIZE_INVALID', 'A arte deve possuir no máximo 25 MB.', 422);
  }
}
