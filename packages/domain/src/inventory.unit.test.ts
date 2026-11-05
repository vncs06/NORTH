import { describe, expect, it } from 'vitest';
import {
  addQuantities,
  assertMovementDelta,
  calculateInventoryBalance,
  enforceNegativeStockPolicy,
  isSessionUsable,
  normalizeEmail,
  normalizeMaterialCode,
  sanitizeAuditData,
  selectEffectiveCost,
} from './index.js';

describe('domínio do Sprint 001', () => {
  it('preserva precisão decimal e calcula sinal pelo tipo', () => {
    expect(addQuantities('0.1', '0.2')).toBe('0.3');
    expect(assertMovementDelta('ADJUSTMENT_OUT', '1.000001')).toBe('-1.000001');
    expect(calculateInventoryBalance('10.250001', '0.250001')).toEqual({
      physical: '10.250001',
      reserved: '0.250001',
      available: '10',
    });
  });

  it('normaliza email e código', () => {
    expect(normalizeEmail(' GESTOR@Example.TEST ')).toBe('gestor@example.test');
    expect(normalizeMaterialCode(' mat  01 ')).toBe('MAT-01');
  });

  it('bloqueia negativo para funcionário e permite confirmação do gestor', () => {
    expect(() =>
      enforceNegativeStockPolicy({
        resultingPhysical: '-1',
        role: 'EMPLOYEE',
        confirmNegative: true,
        reason: 'tentativa',
      }),
    ).toThrowError(/Somente um gestor/);
    expect(() =>
      enforceNegativeStockPolicy({
        resultingPhysical: '-1',
        role: 'MANAGER',
        confirmNegative: true,
        reason: 'inventário conferido',
      }),
    ).not.toThrow();
  });

  it('remove segredos recursivamente da auditoria', () => {
    expect(
      sanitizeAuditData({ email: 'a@b', password: 'x', nested: { token: 'y', ok: 1 } }),
    ).toEqual({
      email: 'a@b',
      nested: { ok: 1 },
    });
  });

  it('invalida sessão por status, versão, revogação ou expiração', () => {
    const base = {
      userStatus: 'ACTIVE' as const,
      storedVersion: 2,
      currentVersion: 2,
      expiresAt: new Date('2026-11-05T13:00:00Z'),
      now: new Date('2026-11-05T12:00:00Z'),
      revokedAt: null,
    };
    expect(isSessionUsable(base)).toBe(true);
    expect(isSessionUsable({ ...base, userStatus: 'DISABLED' })).toBe(false);
    expect(isSessionUsable({ ...base, currentVersion: 3 })).toBe(false);
    expect(isSessionUsable({ ...base, revokedAt: new Date('2026-11-05T11:00:00Z') })).toBe(false);
    expect(isSessionUsable({ ...base, now: base.expiresAt })).toBe(false);
  });

  it('seleciona custo vigente de forma determinística', () => {
    const costs = [
      {
        id: 'a',
        amountCents: 1000,
        effectiveAt: new Date('2026-11-01T00:00:00Z'),
        createdAt: new Date('2026-11-01T01:00:00Z'),
      },
      {
        id: 'b',
        amountCents: 1200,
        effectiveAt: new Date('2026-11-01T00:00:00Z'),
        createdAt: new Date('2026-11-01T02:00:00Z'),
      },
      {
        id: 'c',
        amountCents: 1300,
        effectiveAt: new Date('2026-12-01T00:00:00Z'),
        createdAt: new Date('2026-11-01T03:00:00Z'),
      },
    ];
    expect(selectEffectiveCost(costs, new Date('2026-11-05T00:00:00Z'))?.amountCents).toBe(1200);
  });
});
