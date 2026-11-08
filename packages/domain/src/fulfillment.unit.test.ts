import { describe, expect, it } from 'vitest';
import {
  assertArtworkTransition,
  assertAsaasApiKeyEnvironment,
  assertAsaasConnectionTransition,
  assertHostedInvoiceUrl,
  assertOrderTransition,
  calculateDepositCents,
  calculatePaymentFee,
  evaluateOrderReadiness,
  paymentEventStatus,
  normalizeAndValidateTaxDocument,
  maskIntegrationEmail,
  sumMaterialRequirements,
} from './fulfillment.js';
import { sanitizeBusinessAuditData } from './index.js';

const syntheticValidCpf = ['529', '982', '247', '25'].join('');
const syntheticValidCnpj = ['11', '222', '333', '0001', '81'].join('');

describe('fulfillment domain', () => {
  it('calcula sinal em centavos com HALF_UP e respeita mínimo sem superar total', () => {
    expect(
      calculateDepositCents({ totalCents: 10_001, rateBps: 3_333, minimumAmountCents: 0 }),
    ).toBe(3_333);
    expect(
      calculateDepositCents({ totalCents: 1_000, rateBps: 1_000, minimumAmountCents: 250 }),
    ).toBe(250);
    expect(() =>
      calculateDepositCents({ totalCents: 100, rateBps: 0, minimumAmountCents: 200 }),
    ).toThrowError(/não pode superar/);
  });

  it('soma demanda com seis casas sem usar number', () => {
    expect(sumMaterialRequirements(['1.000001', '2.5', '0.000009'])).toBe('3.50001');
  });

  it('calcula sinal fixo e percentual preservando centavos e decisão acima do total', () => {
    expect(
      calculateDepositCents({
        totalCents: 10_001,
        policy: { mode: 'FIXED_AMOUNT', fixedAmountCents: 2_345 },
      }),
    ).toBe(2_345);
    expect(
      calculateDepositCents({ totalCents: 10_001, policy: { mode: 'PERCENTAGE', rateBps: 3_333 } }),
    ).toBe(3_333);
    expect(() =>
      calculateDepositCents({
        totalCents: 100,
        policy: { mode: 'FIXED_AMOUNT', fixedAmountCents: 101 },
      }),
    ).toThrowError(/não pode superar/);
    expect(
      calculateDepositCents({
        totalCents: 100,
        policy: { mode: 'FIXED_AMOUNT', fixedAmountCents: 101 },
        allowAboveTotal: true,
      }),
    ).toBe(101);
  });

  it('explica absorção e repasse com HALF_UP', () => {
    expect(
      calculatePaymentFee({
        baseAmountCents: 10_001,
        fixedFeeCents: 49,
        percentageBps: 299,
        strategy: 'ABSORB',
      }),
    ).toEqual({
      baseAmountCents: 10_001,
      feeCents: 348,
      chargedAmountCents: 10_001,
      netAmountCents: 9_653,
    });
    expect(
      calculatePaymentFee({
        baseAmountCents: 10_001,
        fixedFeeCents: 49,
        percentageBps: 299,
        strategy: 'PASS_THROUGH',
      }),
    ).toEqual({
      baseAmountCents: 10_001,
      feeCents: 348,
      chargedAmountCents: 10_349,
      netAmountCents: 10_001,
    });
  });

  it('valida CPF e CNPJ matematicamente, com máscara e compatibilidade PF/PJ', () => {
    const maskedCpf = `${syntheticValidCpf.slice(0, 3)}.${syntheticValidCpf.slice(3, 6)}.${syntheticValidCpf.slice(6, 9)}-${syntheticValidCpf.slice(9)}`;
    const maskedCnpj = `${syntheticValidCnpj.slice(0, 2)}.${syntheticValidCnpj.slice(2, 5)}.${syntheticValidCnpj.slice(5, 8)}/${syntheticValidCnpj.slice(8, 12)}-${syntheticValidCnpj.slice(12)}`;
    expect(normalizeAndValidateTaxDocument(maskedCpf, 'PERSON')).toBe(syntheticValidCpf);
    expect(normalizeAndValidateTaxDocument(maskedCnpj, 'COMPANY')).toBe(syntheticValidCnpj);
    for (const [document, type] of [
      [`${syntheticValidCpf.slice(0, -1)}4`, 'PERSON'],
      ['1'.repeat(11), 'PERSON'],
      [`${syntheticValidCnpj.slice(0, -1)}0`, 'COMPANY'],
      ['1'.repeat(14), 'COMPANY'],
      [syntheticValidCpf, 'COMPANY'],
      [syntheticValidCnpj, 'PERSON'],
      [`${syntheticValidCpf.slice(0, 3)}A${syntheticValidCpf.slice(3)}`, 'PERSON'],
    ] as const)
      expect(() => normalizeAndValidateTaxDocument(document, type)).toThrowError(/inválido/);
  });

  it('aceita apenas URL hospedada confiável e remove fragmento', () => {
    expect(assertHostedInvoiceUrl('https://sandbox.asaas.com/i/abc#fragmento', 'SANDBOX')).toBe(
      'https://sandbox.asaas.com/i/abc',
    );
    expect(() => assertHostedInvoiceUrl('https://evil.example/i/abc', 'SANDBOX')).toThrowError(
      /não confiável/,
    );
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
    expect(() => assertArtworkTransition('DRAFT', 'AWAITING_CUSTOMER_APPROVAL')).not.toThrow();
    expect(() => assertArtworkTransition('AWAITING_CUSTOMER_APPROVAL', 'REJECTED')).not.toThrow();
    expect(() => assertArtworkTransition('DRAFT', 'APPROVED')).toThrowError(/inválida/);
  });

  it('controla o ciclo autônomo da conexão Asaas sem saltos arbitrários', () => {
    expect(() => assertAsaasConnectionTransition('NOT_CONFIGURED', 'CONFIGURING')).not.toThrow();
    expect(() => assertAsaasConnectionTransition('CONFIGURING', 'VALIDATING')).not.toThrow();
    expect(() => assertAsaasConnectionTransition('VALIDATING', 'ACTIVE')).not.toThrow();
    expect(() => assertAsaasConnectionTransition('ACTIVE', 'DISCONNECTED')).toThrowError(
      /inválida/,
    );
  });

  it('separa ambientes reconhecidos e mascara o e-mail operacional', () => {
    expect(() => assertAsaasApiKeyEnvironment('$aact_hmlg_example', 'SANDBOX')).not.toThrow();
    expect(() => assertAsaasApiKeyEnvironment('$aact_prod_example', 'SANDBOX')).toThrowError(
      /ambiente/,
    );
    expect(maskIntegrationEmail('Alerts.Team@example.test')).toBe('a********@example.test');
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
        billingDocument: syntheticValidCpf,
        nested: { apiKey: 'secret', status: 'ACTIVE' },
      }),
    ).toEqual({ nested: { status: 'ACTIVE' } });
  });
});
