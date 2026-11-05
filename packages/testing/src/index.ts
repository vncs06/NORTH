export const testManager = {
  name: 'Gestor E2E',
  email: 'gestor.e2e@example.test',
  password: 'E2ePassword123!',
};

export {
  assertConnectedTestDatabase,
  configuredTestDatabasePolicy,
  validateTestDatabaseEnvironment,
  verifyConnectedTestDatabase,
} from './database-safety.js';
