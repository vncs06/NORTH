import { describe, expect, it } from 'vitest';
import { assertConnectedTestDatabase, validateTestDatabaseEnvironment } from './database-safety.js';

const safe = {
  nodeEnv: 'test',
  testDatabaseUrl: 'postgresql://north:test-secret@localhost:5432/north_test?schema=public',
  developmentDatabaseUrl: 'postgresql://north:dev-secret@localhost:5432/north?schema=public',
};

describe('proteção do banco de testes', () => {
  it('recusa NODE_ENV diferente de test', () => {
    expect(() => validateTestDatabaseEnvironment({ ...safe, nodeEnv: 'development' })).toThrow(
      'NODE_ENV deve ser test',
    );
  });

  it('recusa ausência de TEST_DATABASE_URL', () => {
    expect(() => validateTestDatabaseEnvironment({ ...safe, testDatabaseUrl: undefined })).toThrow(
      'TEST_DATABASE_URL ausente',
    );
  });

  it('recusa URLs textualmente diferentes que apontam para o mesmo banco', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...safe,
        testDatabaseUrl: 'postgres://north:test-secret@127.0.0.1/north_test?schema=one',
        developmentDatabaseUrl:
          'postgresql://other:other-secret@localhost:5432/north%5Ftest?schema=two',
      }),
    ).toThrow('mesmo banco');
  });

  it('recusa explicitamente o banco principal north', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...safe,
        testDatabaseUrl: 'postgresql://north:test-secret@localhost:5432/north',
      }),
    ).toThrow('banco principal north nunca é permitido');
  });

  it('recusa nome fora da allowlist de teste', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...safe,
        testDatabaseUrl: 'postgresql://north:test-secret@localhost:5432/north_testing',
      }),
    ).toThrow('use exclusivamente o banco north_test');
  });

  it('recusa host remoto', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...safe,
        testDatabaseUrl: 'postgresql://north:test-secret@database.example/north_test',
      }),
    ).toThrow('host deve ser local');
  });

  it('recusa banco real conectado divergente', () => {
    const policy = validateTestDatabaseEnvironment(safe);
    expect(() => assertConnectedTestDatabase(policy, 'north')).toThrow(
      'current_database() não corresponde',
    );
  });

  it('aceita somente configuração e banco conectado permitidos', () => {
    const policy = validateTestDatabaseEnvironment(safe);
    expect(() => assertConnectedTestDatabase(policy, 'north_test')).not.toThrow();
  });

  it('não inclui credenciais em mensagens de recusa', () => {
    let message = '';
    try {
      validateTestDatabaseEnvironment({ ...safe, nodeEnv: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toMatch(/test-secret|dev-secret|postgresql:\/\//i);
  });
});
