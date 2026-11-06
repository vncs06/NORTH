import { DomainError, quantityToScaled, scaledToQuantity, type Role } from './index.js';

const QUANTITY_SCALE = 1_000_000n;
const BPS_SCALE = 10_000n;

function assertNonNegativeInteger(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError('INVALID_INTEGER', `${field} deve ser inteiro não negativo.`, 400);
  }
  return BigInt(value);
}

export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new DomainError('INVALID_DIVISOR', 'O divisor deve ser maior que zero.', 422);
  }
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  return negative ? -rounded : rounded;
}

function positiveQuantity(value: string, field: string): bigint {
  const scaled = quantityToScaled(value);
  if (scaled <= 0n) {
    throw new DomainError('INVALID_QUANTITY', `${field} deve ser maior que zero.`, 422);
  }
  return scaled;
}

export interface ConsumptionCalculation {
  baseQuantity: string;
  lossQuantity: string;
  totalQuantity: string;
}

export function calculateConsumption(input: {
  requestedQuantity: string;
  yieldQuantity: string;
  componentQuantity: string;
  lossBps: number;
}): ConsumptionCalculation {
  const requested = positiveQuantity(input.requestedQuantity, 'Quantidade solicitada');
  const yieldQuantity = positiveQuantity(input.yieldQuantity, 'Rendimento');
  const component = positiveQuantity(input.componentQuantity, 'Quantidade do componente');
  const lossBps = assertNonNegativeInteger(input.lossBps, 'Perda');
  const base = divideHalfUp(requested * component, yieldQuantity);
  const total = divideHalfUp(base * (BPS_SCALE + lossBps), BPS_SCALE);
  return {
    baseQuantity: scaledToQuantity(base),
    lossQuantity: scaledToQuantity(total - base),
    totalQuantity: scaledToQuantity(total),
  };
}

export function calculateMaterialCostCents(
  consumptionQuantity: string,
  unitCostCents: number,
): number {
  const consumption = positiveQuantity(consumptionQuantity, 'Consumo');
  const unitCost = assertNonNegativeInteger(unitCostCents, 'Custo unitário');
  const result = divideHalfUp(consumption * unitCost, QUANTITY_SCALE);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError(
      'MONEY_LIMIT_EXCEEDED',
      'Valor monetário excede o limite permitido.',
      422,
    );
  }
  return Number(result);
}

export type PricingComponentType = 'FIXED_QUOTE' | 'FIXED_UNIT' | 'PERCENT_MATERIAL';

export function calculateAdditionalComponentCents(input: {
  type: PricingComponentType;
  amountCents?: number;
  rateBps?: number;
  totalQuantity: string;
  materialCostCents: number;
}): number {
  if (input.type === 'FIXED_QUOTE') {
    return Number(assertNonNegativeInteger(input.amountCents ?? -1, 'Valor fixo'));
  }
  if (input.type === 'FIXED_UNIT') {
    const quantity = positiveQuantity(input.totalQuantity, 'Quantidade total');
    const amount = assertNonNegativeInteger(input.amountCents ?? -1, 'Valor por unidade');
    return Number(divideHalfUp(quantity * amount, QUANTITY_SCALE));
  }
  const materialCost = assertNonNegativeInteger(input.materialCostCents, 'Custo de materiais');
  const rate = assertNonNegativeInteger(input.rateBps ?? -1, 'Percentual');
  return Number(divideHalfUp(materialCost * rate, BPS_SCALE));
}

export type PricingMethod = 'MARKUP' | 'MARGIN';

export function calculateSuggestedPriceCents(
  costBaseCents: number,
  method: PricingMethod,
  rateBps: number,
): number {
  const cost = assertNonNegativeInteger(costBaseCents, 'Custo-base');
  const rate = assertNonNegativeInteger(rateBps, 'Percentual de preço');
  if (method === 'MARGIN' && rate >= BPS_SCALE) {
    throw new DomainError('INVALID_MARGIN', 'A margem deve ser menor que 100%.', 422);
  }
  const result =
    method === 'MARKUP'
      ? divideHalfUp(cost * (BPS_SCALE + rate), BPS_SCALE)
      : divideHalfUp(cost * BPS_SCALE, BPS_SCALE - rate);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError('MONEY_LIMIT_EXCEEDED', 'Preço excede o limite permitido.', 422);
  }
  return Number(result);
}

export function applyDiscount(input: {
  suggestedPriceCents: number;
  discountBps: number;
  role: Role;
  employeeLimitBps: number;
  managerLimitBps: number;
}): { discountCents: number; finalPriceCents: number } {
  const suggested = assertNonNegativeInteger(input.suggestedPriceCents, 'Preço sugerido');
  const discount = assertNonNegativeInteger(input.discountBps, 'Desconto');
  const employeeLimit = assertNonNegativeInteger(input.employeeLimitBps, 'Limite do funcionário');
  const managerLimit = assertNonNegativeInteger(input.managerLimitBps, 'Limite gerencial');
  const allowed = input.role === 'MANAGER' ? managerLimit : employeeLimit;
  if (discount > allowed) {
    throw new DomainError(
      'DISCOUNT_LIMIT_EXCEEDED',
      'O desconto excede o limite permitido para o seu papel.',
      422,
      { allowedBps: Number(allowed) },
    );
  }
  if (discount > BPS_SCALE) {
    throw new DomainError('INVALID_DISCOUNT', 'O desconto não pode exceder 100%.', 422);
  }
  const discountCents = divideHalfUp(suggested * discount, BPS_SCALE);
  return {
    discountCents: Number(discountCents),
    finalPriceCents: Number(suggested - discountCents),
  };
}

export function confirmManualPrice(input: {
  role: Role;
  suggestedFinalCents: number;
  confirmedFinalCents?: number;
  reason?: string;
}): { finalPriceCents: number; adjusted: boolean } {
  if (input.confirmedFinalCents === undefined) {
    return { finalPriceCents: input.suggestedFinalCents, adjusted: false };
  }
  if (input.role !== 'MANAGER') {
    throw new DomainError(
      'MANUAL_PRICE_REQUIRES_MANAGER',
      'Somente um gestor pode ajustar manualmente o preço final.',
      403,
    );
  }
  assertNonNegativeInteger(input.confirmedFinalCents, 'Preço confirmado');
  if (!input.reason?.trim()) {
    throw new DomainError(
      'MANUAL_PRICE_REASON_REQUIRED',
      'Informe o motivo do ajuste manual de preço.',
      422,
    );
  }
  return { finalPriceCents: input.confirmedFinalCents, adjusted: true };
}

export type TechnicalSheetStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type QuoteStatus = 'DRAFT' | 'ISSUED' | 'SUPERSEDED' | 'CANCELLED';

export function assertTechnicalSheetTransition(
  from: TechnicalSheetStatus,
  to: TechnicalSheetStatus,
): void {
  const allowed = (from === 'DRAFT' && to === 'ACTIVE') || (from === 'ACTIVE' && to === 'ARCHIVED');
  if (!allowed) {
    throw new DomainError(
      'INVALID_TECHNICAL_SHEET_TRANSITION',
      `Transição de ficha técnica inválida: ${from} -> ${to}.`,
      409,
    );
  }
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  const allowed =
    (from === 'DRAFT' && to === 'ISSUED') ||
    (from === 'ISSUED' && (to === 'SUPERSEDED' || to === 'CANCELLED'));
  if (!allowed) {
    throw new DomainError(
      'INVALID_QUOTE_TRANSITION',
      `Transição de orçamento inválida: ${from} -> ${to}.`,
      409,
    );
  }
}
