import { afterEach, describe, expect, it } from 'vitest';
import {
  configuredAsaasWebhookUrl,
  generateWebhookAuthToken,
  optionalAsaasWebhookUrl,
} from './fulfillment-infrastructure.js';

const originalPublicBaseUrl = process.env.NORTH_PUBLIC_BASE_URL;

afterEach(() => {
  if (originalPublicBaseUrl === undefined) delete process.env.NORTH_PUBLIC_BASE_URL;
  else process.env.NORTH_PUBLIC_BASE_URL = originalPublicBaseUrl;
});

describe('infraestrutura de onboarding Asaas', () => {
  it('deriva a rota final apenas da configuração confiável da instalação', () => {
    process.env.NORTH_PUBLIC_BASE_URL = 'https://north.example.test/erp/';
    expect(configuredAsaasWebhookUrl()).toBe(
      'https://north.example.test/erp/api/v1/webhooks/asaas/payments',
    );
  });

  it('não inventa URL ausente nem aceita credencial ou query string', () => {
    delete process.env.NORTH_PUBLIC_BASE_URL;
    expect(optionalAsaasWebhookUrl()).toBeNull();
    process.env.NORTH_PUBLIC_BASE_URL = 'https://user:secret@north.example.test/?token=unsafe';
    expect(() => configuredAsaasWebhookUrl()).toThrowError(/não pode conter credenciais/);
  });

  it('gera tokens explícitos fortes, distintos e sem espaços', () => {
    const first = generateWebhookAuthToken();
    const second = generateWebhookAuthToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first.length).toBeLessThanOrEqual(255);
    expect(first).toMatch(/^\S+$/);
  });
});
