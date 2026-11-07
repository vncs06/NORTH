import { afterAll } from 'vitest';
import { startAsaasStub } from './asaas-stub.js';

const server = await startAsaasStub();

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});
