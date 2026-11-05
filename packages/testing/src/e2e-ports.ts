export interface E2ePorts {
  api: number;
  web: number;
}

function parsePort(value: string | undefined, fallback: number, variable: string): number {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`Configuração E2E recusada: ${variable} deve ser uma porta válida.`);
  }
  return port;
}

export function configuredE2ePorts(): E2ePorts {
  const web = parsePort(process.env.E2E_WEB_PORT, 3100, 'E2E_WEB_PORT');
  const api = parsePort(process.env.E2E_API_PORT, 3101, 'E2E_API_PORT');
  if (web === api || [3000, 3001].includes(web) || [3000, 3001].includes(api)) {
    throw new Error('Configuração E2E recusada: use portas exclusivas, diferentes de 3000 e 3001.');
  }
  return { api, web };
}
