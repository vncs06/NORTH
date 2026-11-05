import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { closeDatabase } from '@north/database';
import { NorthRepository } from './repository.js';

const required = [
  'BOOTSTRAP_COMPANY_NAME',
  'BOOTSTRAP_MANAGER_NAME',
  'BOOTSTRAP_MANAGER_EMAIL',
  'BOOTSTRAP_MANAGER_PASSWORD',
] as const;

for (const key of required) {
  if (!process.env[key]) throw new Error(`Variável obrigatória ausente: ${key}`);
}

const repository = new NorthRepository();
try {
  const result = await repository.bootstrap(
    {
      companyName: process.env.BOOTSTRAP_COMPANY_NAME!,
      timezone: process.env.BOOTSTRAP_TIMEZONE ?? 'America/Manaus',
      managerName: process.env.BOOTSTRAP_MANAGER_NAME!,
      managerEmail: process.env.BOOTSTRAP_MANAGER_EMAIL!,
      managerPassword: process.env.BOOTSTRAP_MANAGER_PASSWORD!,
    },
    randomUUID(),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await closeDatabase();
}
