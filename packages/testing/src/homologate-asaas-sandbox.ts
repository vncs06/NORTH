import 'dotenv/config';

const required = [
  'ASAAS_ENVIRONMENT',
  'ASAAS_API_KEY',
  'ASAAS_WEBHOOK_AUTH_TOKEN',
  'ASAAS_WEBHOOK_PUBLIC_URL',
] as const;
const missing = required.filter((name) => !process.env[name]);
const publicUrl = process.env.ASAAS_WEBHOOK_PUBLIC_URL;
const maskedUrl = publicUrl
  ? (() => {
      const url = new URL(publicUrl);
      return `${url.protocol}//${url.host}/…`;
    })()
  : 'ausente';
process.stdout.write(
  `Preflight Asaas: ambiente=${process.env.ASAAS_ENVIRONMENT ?? 'ausente'}; URL=${maskedUrl}; variáveis=${missing.length ? `ausentes: ${missing.join(', ')}` : 'presentes'}.\n`,
);
if (missing.length) {
  process.stderr.write(
    `BLOQUEADO: homologação real exige variáveis seguras ausentes: ${missing.join(', ')}. Não informe segredos em argumentos, chat ou repositório.\n`,
  );
  process.exitCode = 2;
} else if (process.env.ASAAS_ENVIRONMENT !== 'SANDBOX') {
  process.stderr.write(
    'BLOQUEADO: somente ASAAS_ENVIRONMENT=SANDBOX é permitido. Nenhuma chamada foi feita.\n',
  );
  process.exitCode = 2;
} else if (!publicUrl!.startsWith('https://')) {
  process.stderr.write('BLOQUEADO: ASAAS_WEBHOOK_PUBLIC_URL deve usar HTTPS público.\n');
  process.exitCode = 2;
} else {
  const base = 'https://api-sandbox.asaas.com/v3';
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    access_token: process.env.ASAAS_API_KEY!,
    'user-agent': 'NORTH-ERP-HOMOLOGATION/0.1',
  };
  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const requestHeaders = { ...headers };
    if (!init.body) delete (requestHeaders as { 'content-type'?: string })['content-type'];
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: requestHeaders,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`ASAAS_SANDBOX_HTTP_${response.status}`);
    return response.json() as Promise<T>;
  }
  try {
    const fees = await call<Record<string, unknown>>('/myAccount/fees/', { method: 'GET' });
    const reference = `NORTH-HOMOLOG-${new Date().toISOString().slice(0, 10)}`;
    const found = await call<{ data: Array<{ id: string }> }>(
      `/customers?externalReference=${encodeURIComponent(reference)}`,
      { method: 'GET' },
    );
    const customer =
      found.data[0] ??
      (await call<{ id: string }>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Cliente Fictício NORTH Homologação',
          externalReference: reference,
          notificationDisabled: true,
        }),
      }));
    const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const payment = await call<{ id: string; status: string; invoiceUrl?: string }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customer.id,
        billingType: 'PIX',
        value: 1,
        dueDate,
        externalReference: `${reference}-${Date.now()}`,
      }),
    });
    const webhooks = await call<{ data: Array<{ id: string; url: string }> }>('/webhooks', {
      method: 'GET',
    });
    const existingWebhook = webhooks.data.find((item) => item.url === publicUrl);
    const webhook =
      existingWebhook ??
      (await call<{ id: string }>('/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name: 'NORTH ERP homologação',
          url: publicUrl,
          authToken: process.env.ASAAS_WEBHOOK_AUTH_TOKEN,
          enabled: true,
          interrupted: false,
          events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'],
        }),
      }));
    process.stdout.write(
      `Homologação Sandbox: autenticação=PASSOU; taxas=PASSOU (${Object.keys(fees).length} grupos); cliente fictício=${found.data[0] ? 'REUTILIZADO' : 'CRIADO'}; cobrança PIX=CRIADA (${payment.status}); webhook=${existingWebhook ? 'REUTILIZADO' : 'CRIADO'}; IDs sanitizados=${customer.id.slice(0, 8)}…/${payment.id.slice(0, 8)}…/${webhook.id.slice(0, 8)}…. Host chamado exclusivamente api-sandbox.asaas.com.\n`,
    );
    process.stdout.write(
      'PENDENTE DE CONFIRMAÇÃO ASSÍNCRONA: confirme inbox, token, idempotência, transição financeira e reserva após o evento real no endpoint público.\n',
    );
  } catch (error) {
    process.stderr.write(
      `FALHOU: conectividade/contrato Sandbox: ${error instanceof Error ? error.message : 'erro desconhecido'}. Nenhum segredo foi exibido.\n`,
    );
    process.exitCode = 1;
  }
}
