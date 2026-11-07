import { DomainError, quantityToScaled, scaledToQuantity, type Role } from './index.js';
import { divideHalfUp } from './commercial.js';

const BPS = 10_000n;

export type OrderStatus =
  'PENDING_READINESS' | 'READY_FOR_PRODUCTION' | 'FINANCIAL_REVIEW' | 'CANCELLED';

export type ArtworkStatus =
  | 'DRAFT'
  | 'AWAITING_CUSTOMER_APPROVAL'
  | 'CUSTOMER_CONFIRMED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type DepositPolicy =
  | { mode: 'PERCENTAGE'; rateBps: number; fixedAmountCents?: null }
  | { mode: 'FIXED_AMOUNT'; rateBps?: null; fixedAmountCents: number };

export type FeeStrategy = 'ABSORB' | 'PASS_THROUGH';

export function calculateDepositCents(input: {
  totalCents: number;
  policy?: DepositPolicy;
  rateBps?: number;
  minimumAmountCents?: number;
  allowAboveTotal?: boolean;
}): number {
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents < 0) {
    throw new DomainError(
      'INVALID_ORDER_TOTAL',
      'O total do pedido deve ser inteiro não negativo.',
      422,
    );
  }
  const policy: DepositPolicy = input.policy ?? {
    mode: 'PERCENTAGE',
    rateBps: input.rateBps ?? 0,
  };
  if (
    policy.mode === 'PERCENTAGE' &&
    (!Number.isSafeInteger(policy.rateBps) || policy.rateBps < 0 || policy.rateBps > 10_000)
  ) {
    throw new DomainError(
      'INVALID_DEPOSIT_RATE',
      'O percentual de sinal deve estar entre 0 e 100%.',
      422,
    );
  }
  if (
    policy.mode === 'FIXED_AMOUNT' &&
    (!Number.isSafeInteger(policy.fixedAmountCents) || policy.fixedAmountCents < 0)
  ) {
    throw new DomainError('INVALID_FIXED_DEPOSIT', 'O sinal fixo deve ser não negativo.', 422);
  }
  const calculated =
    policy.mode === 'PERCENTAGE'
      ? Number(divideHalfUp(BigInt(input.totalCents) * BigInt(policy.rateBps), BPS))
      : policy.fixedAmountCents;
  const legacyMinimum = input.minimumAmountCents ?? 0;
  const result = Math.max(calculated, legacyMinimum);
  if (result > input.totalCents && !input.allowAboveTotal) {
    throw new DomainError(
      'DEPOSIT_EXCEEDS_ORDER_TOTAL',
      'O sinal não pode superar o total sem decisão gerencial explícita.',
      422,
    );
  }
  return result;
}

export function calculatePaymentFee(input: {
  baseAmountCents: number;
  fixedFeeCents: number;
  percentageBps: number;
  strategy: FeeStrategy;
}): {
  baseAmountCents: number;
  feeCents: number;
  chargedAmountCents: number;
  netAmountCents: number;
} {
  for (const [name, value] of Object.entries(input)) {
    if (name === 'strategy') continue;
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new DomainError(
        'INVALID_FEE_VALUE',
        'Valores de taxa devem ser inteiros não negativos.',
        422,
      );
    }
  }
  if (input.percentageBps > 10_000) {
    throw new DomainError('INVALID_FEE_RATE', 'A taxa percentual deve estar entre 0 e 100%.', 422);
  }
  const variable = Number(
    divideHalfUp(BigInt(input.baseAmountCents) * BigInt(input.percentageBps), BPS),
  );
  const feeCents = input.fixedFeeCents + variable;
  const chargedAmountCents =
    input.strategy === 'PASS_THROUGH' ? input.baseAmountCents + feeCents : input.baseAmountCents;
  return {
    baseAmountCents: input.baseAmountCents,
    feeCents,
    chargedAmountCents,
    netAmountCents: chargedAmountCents - feeCents,
  };
}

export function normalizeAndValidateTaxDocument(
  raw: string,
  customerType: 'PERSON' | 'COMPANY',
): string {
  if (!/^[\d.\-/\s]+$/.test(raw)) {
    throw new DomainError('INVALID_TAX_DOCUMENT', 'CPF ou CNPJ contém caracteres inválidos.', 422);
  }
  const digits = raw.replace(/\D/g, '');
  const expected = customerType === 'PERSON' ? 11 : 14;
  if (digits.length !== expected || /^(\d)\1+$/.test(digits)) {
    throw new DomainError(
      'INVALID_TAX_DOCUMENT',
      'CPF ou CNPJ inválido para o tipo de cliente.',
      422,
    );
  }
  const valid = customerType === 'PERSON' ? validCpf(digits) : validCnpj(digits);
  if (!valid) throw new DomainError('INVALID_TAX_DOCUMENT', 'CPF ou CNPJ inválido.', 422);
  return digits;
}

function checkDigit(value: string, weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function validCpf(value: string): boolean {
  const first = checkDigit(value, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(`${value.slice(0, 9)}${first}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return value.endsWith(`${first}${second}`);
}

function validCnpj(value: string): boolean {
  const first = checkDigit(value, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(
    `${value.slice(0, 12)}${first}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return value.endsWith(`${first}${second}`);
}

export function assertHostedInvoiceUrl(
  value: string,
  environment: 'SANDBOX' | 'PRODUCTION',
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError(
      'INVALID_HOSTED_PAYMENT_URL',
      'URL hospedada de pagamento inválida.',
      502,
    );
  }
  const permitted =
    environment === 'SANDBOX' ? ['sandbox.asaas.com', 'www.asaas.com'] : ['www.asaas.com'];
  const testLocal =
    process.env.NODE_ENV === 'test' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (
    (!testLocal && url.protocol !== 'https:') ||
    (!testLocal && !permitted.includes(url.hostname))
  ) {
    throw new DomainError(
      'INVALID_HOSTED_PAYMENT_URL',
      'URL hospedada de pagamento não confiável.',
      502,
    );
  }
  url.hash = '';
  return url.toString();
}

export function sumMaterialRequirements(values: string[]): string {
  const sum = values.reduce((total, value) => total + quantityToScaled(value), 0n);
  if (sum <= 0n)
    throw new DomainError('INVALID_MATERIAL_REQUIREMENT', 'A demanda deve ser positiva.', 422);
  return scaledToQuantity(sum);
}

export function evaluateOrderReadiness(input: {
  artworkApproved: boolean;
  paidAmountCents: number;
  depositAmountCents: number;
  financialExceptionApproved: boolean;
  stockAvailable: boolean;
  stockExceptionApproved: boolean;
}): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!input.artworkApproved) blockers.push('ARTWORK_NOT_APPROVED');
  if (input.paidAmountCents < input.depositAmountCents && !input.financialExceptionApproved) {
    blockers.push('DEPOSIT_NOT_CONFIRMED');
  }
  if (!input.stockAvailable && !input.stockExceptionApproved) blockers.push('INSUFFICIENT_STOCK');
  return { ready: blockers.length === 0, blockers };
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed =
    (from === 'PENDING_READINESS' &&
      (to === 'READY_FOR_PRODUCTION' || to === 'FINANCIAL_REVIEW' || to === 'CANCELLED')) ||
    (from === 'FINANCIAL_REVIEW' && (to === 'PENDING_READINESS' || to === 'CANCELLED')) ||
    (from === 'READY_FOR_PRODUCTION' && to === 'CANCELLED');
  if (!allowed) {
    throw new DomainError(
      'INVALID_ORDER_TRANSITION',
      `Transição de pedido inválida: ${from} -> ${to}.`,
      409,
    );
  }
}

export function assertArtworkTransition(from: ArtworkStatus, to: ArtworkStatus): void {
  const allowed =
    (from === 'DRAFT' && (to === 'AWAITING_CUSTOMER_APPROVAL' || to === 'SUPERSEDED')) ||
    (from === 'AWAITING_CUSTOMER_APPROVAL' &&
      (to === 'CUSTOMER_CONFIRMED' || to === 'REJECTED' || to === 'SUPERSEDED')) ||
    (from === 'CUSTOMER_CONFIRMED' &&
      (to === 'APPROVED' || to === 'REJECTED' || to === 'SUPERSEDED')) ||
    ((from === 'APPROVED' || from === 'REJECTED') && to === 'SUPERSEDED');
  if (!allowed) {
    throw new DomainError(
      'INVALID_ARTWORK_TRANSITION',
      `Transição de arte inválida: ${from} -> ${to}.`,
      409,
    );
  }
}

export function assertStockException(input: {
  role: Role;
  hasShortage: boolean;
  confirmException: boolean;
  reason?: string;
}): void {
  if (!input.hasShortage) return;
  if (input.role !== 'MANAGER' || !input.confirmException) {
    throw new DomainError(
      'INSUFFICIENT_STOCK_REQUIRES_MANAGER',
      'Saldo insuficiente. Somente o gestor pode confirmar a exceção de reserva.',
      409,
    );
  }
  if (!input.reason?.trim() || input.reason.trim().length < 3) {
    throw new DomainError(
      'STOCK_EXCEPTION_REASON_REQUIRED',
      'Informe o motivo da exceção de estoque.',
      422,
    );
  }
}

export function paymentEventStatus(
  event: string,
):
  | 'CREATED'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'CHARGEBACK'
  | null {
  const map: Record<string, ReturnType<typeof paymentEventStatus>> = {
    PAYMENT_CREATED: 'CREATED',
    PAYMENT_CONFIRMED: 'CONFIRMED',
    PAYMENT_RECEIVED: 'RECEIVED',
    PAYMENT_OVERDUE: 'OVERDUE',
    PAYMENT_REFUNDED: 'REFUNDED',
    PAYMENT_PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
    PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
    PAYMENT_CHARGEBACK_DISPUTE: 'CHARGEBACK',
  };
  return map[event] ?? null;
}
