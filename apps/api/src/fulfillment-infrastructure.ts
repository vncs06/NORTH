import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '@north/domain';

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
  billingType: 'PIX' | 'BOLETO' | 'UNDEFINED';
  value: number;
  dueDate: string;
  externalReference: string;
}

export class AsaasGateway {
  private readonly baseUrl: string;

  constructor(private readonly apiKey: string) {
    const configured = process.env.ASAAS_BASE_URL;
    if (configured && process.env.NODE_ENV !== 'test') {
      throw new Error('ASAAS_BASE_URL_OVERRIDE_NOT_ALLOWED');
    }
    this.baseUrl = configured ?? 'https://api-sandbox.asaas.com/v3';
  }

  private async request<T>(pathname: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        access_token: this.apiKey,
        'user-agent': 'NORTH-ERP/0.1',
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new DomainError(
        'ASAAS_REQUEST_FAILED',
        'O Asaas recusou ou não concluiu a operação.',
        502,
        { providerStatus: response.status },
      );
    }
    return (await response.json()) as T;
  }

  createCustomer(input: AsaasCustomerRequest): Promise<{ id: string }> {
    return this.request('/customers', { method: 'POST', body: JSON.stringify(input) });
  }

  createCharge(input: AsaasChargeRequest): Promise<{
    id: string;
    status: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
  }> {
    return this.request('/payments', { method: 'POST', body: JSON.stringify(input) });
  }
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
