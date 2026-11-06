const QUANTITY_SCALE = 1_000_000n;
const MAX_ABSOLUTE_QUANTITY = 999_999_999_999n * QUANTITY_SCALE;

export type Role = 'MANAGER' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export type MaterialStatus = 'ACTIVE' | 'INACTIVE';
export type MovementType = 'OPENING_BALANCE' | 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function normalizeMaterialCode(value: string): string {
  return value.trim().replace(/\s+/g, '-').toLocaleUpperCase('en-US');
}

export function quantityToScaled(value: string): bigint {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw new DomainError(
      'INVALID_QUANTITY',
      'Quantidade deve ser decimal, sem notação exponencial e com até seis casas.',
      400,
    );
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const scaled = BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(6, '0'));
  const signed = negative ? -scaled : scaled;
  if (signed > MAX_ABSOLUTE_QUANTITY || signed < -MAX_ABSOLUTE_QUANTITY) {
    throw new DomainError('QUANTITY_LIMIT_EXCEEDED', 'Quantidade excede o limite permitido.', 400);
  }
  return signed;
}

export function scaledToQuantity(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / QUANTITY_SCALE;
  const fraction = (absolute % QUANTITY_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

export function addQuantities(left: string, right: string): string {
  return scaledToQuantity(quantityToScaled(left) + quantityToScaled(right));
}

export function calculateInventoryBalance(physical: string, reserved: string) {
  quantityToScaled(physical);
  quantityToScaled(reserved);
  return {
    physical,
    reserved,
    available: addQuantities(physical, `-${reserved}`),
  };
}

export function isSessionUsable(input: {
  userStatus: UserStatus;
  storedVersion: number;
  currentVersion: number;
  expiresAt: Date;
  now: Date;
  revokedAt: Date | null;
}): boolean {
  return (
    input.userStatus === 'ACTIVE' &&
    input.storedVersion === input.currentVersion &&
    input.revokedAt === null &&
    input.expiresAt.getTime() > input.now.getTime()
  );
}

export function selectEffectiveCost<T extends { effectiveAt: Date; createdAt: Date; id: string }>(
  costs: T[],
  at: Date,
): T | null {
  return (
    costs
      .filter((cost) => cost.effectiveAt.getTime() <= at.getTime())
      .sort(
        (left, right) =>
          right.effectiveAt.getTime() - left.effectiveAt.getTime() ||
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      )[0] ?? null
  );
}

export function assertMovementDelta(type: MovementType, quantity: string): string {
  const raw = quantityToScaled(quantity);
  if (raw === 0n) {
    throw new DomainError('ZERO_QUANTITY', 'A quantidade do movimento não pode ser zero.', 422);
  }
  const absolute = raw < 0n ? -raw : raw;
  const isOutgoing = type === 'ADJUSTMENT_OUT';
  const signed = isOutgoing ? -absolute : absolute;
  return scaledToQuantity(signed);
}

export function enforceNegativeStockPolicy(input: {
  resultingPhysical: string;
  role: Role;
  confirmNegative: boolean;
  reason?: string;
}): void {
  if (quantityToScaled(input.resultingPhysical) >= 0n) return;
  if (input.role !== 'MANAGER' || !input.confirmNegative) {
    throw new DomainError(
      'NEGATIVE_STOCK_REQUIRES_MANAGER',
      'O saldo ficaria negativo. Somente um gestor pode confirmar essa exceção.',
      409,
      { projectedPhysical: input.resultingPhysical },
    );
  }
  if (!input.reason?.trim()) {
    throw new DomainError(
      'NEGATIVE_STOCK_REASON_REQUIRED',
      'Informe o motivo para confirmar saldo negativo.',
      422,
    );
  }
}

export function assertRole(role: Role, allowed: Role[]): void {
  if (!allowed.includes(role)) {
    throw new DomainError('FORBIDDEN', 'Você não tem permissão para esta operação.', 403);
  }
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'sessiontoken',
  'cookie',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'cpf',
  'cnpj',
  'cpfcnpj',
  'billingdocument',
  'billing_document',
]);

export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEYS.has(key.toLocaleLowerCase('en-US')))
        .map(([key, nested]) => [key, sanitizeAuditData(nested)]),
    );
  }
  return value;
}

const PERSONAL_AUDIT_KEYS = new Set([
  'email',
  'phone',
  'operationalnote',
  'operational_note',
  'cpf',
  'cnpj',
  'cpfcnpj',
  'billingdocument',
  'billing_document',
]);

export function sanitizeBusinessAuditData(value: unknown): unknown {
  const sanitized = sanitizeAuditData(value);
  if (Array.isArray(sanitized)) return sanitized.map(sanitizeBusinessAuditData);
  if (sanitized && typeof sanitized === 'object') {
    return Object.fromEntries(
      Object.entries(sanitized)
        .filter(([key]) => !PERSONAL_AUDIT_KEYS.has(key.toLocaleLowerCase('en-US')))
        .map(([key, nested]) => [key, sanitizeBusinessAuditData(nested)]),
    );
  }
  return sanitized;
}
