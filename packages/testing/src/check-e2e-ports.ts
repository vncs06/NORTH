import { createServer } from 'node:net';
import { configuredE2ePorts } from './e2e-ports.js';

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', () => {
      reject(new Error(`E2E recusado: a porta exclusiva ${port} já está ocupada.`));
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

const ports = configuredE2ePorts();
await assertPortAvailable(ports.web);
await assertPortAvailable(ports.api);
process.stdout.write(`Portas E2E disponíveis: ${ports.web}/${ports.api}.\n`);
