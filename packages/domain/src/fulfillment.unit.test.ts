import { describe, expect, it } from 'vitest';
import {
  assertArtworkTransition,
  assertOrderTransition,
  calculateDepositCents,
  evaluateOrderReadiness,
  paymentEventStatus,
  sumMaterialRequirements,
} from './fulfillment.js';
import { sanitizeBusinessAuditData } from './index.js';

describe('fulfillment domain', () => {
  it('calcula sinal em centavos com HALF_UP e respeita mínimo sem superar total', () => {
    expect(
      calculateDepositCents({ totalCents: 10_001, rateBps: 3_333, minimumAmountCents: 0 }),
    ).toBe(3_333);
    expect(
      calculateDepositCents({ totalCents: 1_000, rateBps: 1_000, minimumAmountCents: 250 }),
    ).toBe(250);
    expect(calculateDepositCents({ totalCents: 100, rateBps: 0, minimumAmountCents: 200 })).toBe(
      100,
    );
  });

  it('soma demanda com seis casas sem usar number', () => {
    expect(sumMaterialRequirements(['1.000001', '2.5', '0.000009'])).toBe('3.50001');
  });

  it('explica todos os bloqueadores de prontidão', () => {
    expect(
      evaluateOrderReadiness({
        artworkApproved: false,
        paidAmountCents: 10,
        depositAmountCents: 100,
        financialExceptionApproved: false,
        stockAvailable: false,
        stockExceptionApproved: false,
      }),
    ).toEqual({
      ready: false,
      blockers: ['ARTWORK_NOT_APPROVED', 'DEPOSIT_NOT_CONFIRMED', 'INSUFFICIENT_STOCK'],
    });
  });

  it('aceita apenas transições explícitas', () => {
    expect(() => assertOrderTransition('PENDING_READINESS', 'READY_FOR_PRODUCTION')).not.toThrow();
    expect(() => assertOrderTransition('CANCELLED', 'READY_FOR_PRODUCTION')).toThrowError(
      /inválida/,
    );
    expect(() => assertArtworkTransition('CUSTOMER_CONFIRMED', 'APPROVED')).not.toThrow();
    expect(() => assertArtworkTransition('PENDING_CUSTOMER', 'APPROVED')).toThrowError(/inválida/);
  });

  it('mapeia somente eventos financeiros conhecidos', () => {
    expect(paymentEventStatus('PAYMENT_CONFIRMED')).toBe('CONFIRMED');
    expect(paymentEventStatus('PAYMENT_REFUNDED')).toBe('REFUNDED');
    expect(paymentEventStatus('PAYMENT_UPDATED')).toBeNull();
  });

  it('remove PII e segredos da auditoria comercial sem alterar o contrato legado', () => {
    expect(
      sanitizeBusinessAuditData({
        email: 'cliente@example.test',
        phone: '9999',
        billingDocument: '52998224725',
        nested: { apiKey: 'secret', status: 'ACTIVE' },
      }),
    ).toEqual({ nested: { status: 'ACTIVE' } });
  });
});
