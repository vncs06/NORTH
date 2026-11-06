import { DomainError, quantityToScaled, scaledToQuantity, type Role } from './index.js';
import { divideHalfUp } from './commercial.js';

const BPS = 10_000n;

export type OrderStatus =
  'PENDING_READINESS' | 'READY_FOR_PRODUCTION' | 'FINANCIAL_REVIEW' | 'CANCELLED';

export type ArtworkStatus = 'PENDING_CUSTOMER' | 'CUSTOMER_CONFIRMED' | 'APPROVED' | 'SUPERSEDED';

export function calculateDepositCents(input: {
  totalCents: number;
  rateBps: number;
  minimumAmountCents: number;
}): number {
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents < 0) {
    throw new DomainError(
      'INVALID_ORDER_TOTAL',
      'O total do pedido deve ser inteiro não negativo.',
      422,
    );
  }
  if (!Number.isSafeInteger(input.rateBps) || input.rateBps < 0 || input.rateBps > 10_000) {
    throw new DomainError(
      'INVALID_DEPOSIT_RATE',
      'O percentual de sinal deve estar entre 0 e 100%.',
      422,
    );
  }
  if (!Number.isSafeInteger(input.minimumAmountCents) || input.minimumAmountCents < 0) {
    throw new DomainError('INVALID_DEPOSIT_MINIMUM', 'O sinal mínimo deve ser não negativo.', 422);
  }
  const proportional = Number(divideHalfUp(BigInt(input.totalCents) * BigInt(input.rateBps), BPS));
  return Math.min(input.totalCents, Math.max(proportional, input.minimumAmountCents));
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
    (from === 'PENDING_CUSTOMER' && (to === 'CUSTOMER_CONFIRMED' || to === 'SUPERSEDED')) ||
    (from === 'CUSTOMER_CONFIRMED' && (to === 'APPROVED' || to === 'SUPERSEDED')) ||
    (from === 'APPROVED' && to === 'SUPERSEDED');
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
