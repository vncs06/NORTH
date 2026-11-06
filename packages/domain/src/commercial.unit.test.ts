import { describe, expect, it } from 'vitest';
import {
  applyDiscount,
  assertQuoteTransition,
  assertTechnicalSheetTransition,
  calculateAdditionalComponentCents,
  calculateConsumption,
  calculateMaterialCostCents,
  calculateSuggestedPriceCents,
  confirmManualPrice,
  divideHalfUp,
} from './commercial.js';

describe('domínio comercial do Sprint 002', () => {
  it('calcula consumo por rendimento e perda em pontos-base', () => {
    expect(
      calculateConsumption({
        requestedQuantity: '10',
        yieldQuantity: '2',
        componentQuantity: '0.5',
        lossBps: 1000,
      }),
    ).toEqual({ baseQuantity: '2.5', lossQuantity: '0.25', totalQuantity: '2.75' });
  });

  it('arredonda quantidades e dinheiro com HALF_UP', () => {
    expect(divideHalfUp(5n, 2n)).toBe(3n);
    expect(calculateMaterialCostCents('2.5', 101)).toBe(253);
  });

  it('calcula componentes fixos e percentuais', () => {
    expect(
      calculateAdditionalComponentCents({
        type: 'FIXED_QUOTE',
        amountCents: 700,
        totalQuantity: '3',
        materialCostCents: 1010,
      }),
    ).toBe(700);
    expect(
      calculateAdditionalComponentCents({
        type: 'FIXED_UNIT',
        amountCents: 125,
        totalQuantity: '2.5',
        materialCostCents: 1010,
      }),
    ).toBe(313);
    expect(
      calculateAdditionalComponentCents({
        type: 'PERCENT_MATERIAL',
        rateBps: 500,
        totalQuantity: '2.5',
        materialCostCents: 1010,
      }),
    ).toBe(51);
  });

  it('distingue markup de margem', () => {
    expect(calculateSuggestedPriceCents(1000, 'MARKUP', 2500)).toBe(1250);
    expect(calculateSuggestedPriceCents(1000, 'MARGIN', 2500)).toBe(1333);
    expect(() => calculateSuggestedPriceCents(1000, 'MARGIN', 10000)).toThrow(
      'margem deve ser menor',
    );
  });

  it('aplica desconto conforme o papel e preserva centavos', () => {
    expect(
      applyDiscount({
        suggestedPriceCents: 1001,
        discountBps: 5000,
        role: 'MANAGER',
        employeeLimitBps: 500,
        managerLimitBps: 5000,
      }),
    ).toEqual({ discountCents: 501, finalPriceCents: 500 });
    expect(() =>
      applyDiscount({
        suggestedPriceCents: 1000,
        discountBps: 501,
        role: 'EMPLOYEE',
        employeeLimitBps: 500,
        managerLimitBps: 2000,
      }),
    ).toThrow('excede o limite');
  });

  it('reserva ajuste manual ao gestor e exige motivo', () => {
    expect(() =>
      confirmManualPrice({
        role: 'EMPLOYEE',
        suggestedFinalCents: 1000,
        confirmedFinalCents: 900,
        reason: 'Negociação',
      }),
    ).toThrow('Somente um gestor');
    expect(() =>
      confirmManualPrice({
        role: 'MANAGER',
        suggestedFinalCents: 1000,
        confirmedFinalCents: 900,
      }),
    ).toThrow('motivo');
    expect(
      confirmManualPrice({
        role: 'MANAGER',
        suggestedFinalCents: 1000,
        confirmedFinalCents: 900,
        reason: 'Condição comercial',
      }),
    ).toEqual({ finalPriceCents: 900, adjusted: true });
  });

  it('protege transições de ficha e orçamento', () => {
    expect(() => assertTechnicalSheetTransition('DRAFT', 'ACTIVE')).not.toThrow();
    expect(() => assertTechnicalSheetTransition('ACTIVE', 'DRAFT')).toThrow();
    expect(() => assertQuoteTransition('DRAFT', 'ISSUED')).not.toThrow();
    expect(() => assertQuoteTransition('ISSUED', 'SUPERSEDED')).not.toThrow();
    expect(() => assertQuoteTransition('ISSUED', 'DRAFT')).toThrow();
  });
});
