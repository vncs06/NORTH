import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { pathToFileURL } from 'node:url';

const port = Number(process.env.ASAAS_STUB_PORT ?? 3199);
const customers = new Map<string, Record<string, unknown>>();
const payments = new Map<string, Record<string, unknown>>();
const webhooks = new Map<string, Record<string, unknown>>();
const calls: Array<{
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}> = [];
let scenario = 'success';

function reply(response: http.ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(value));
}

function publicHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([name]) => !['access_token', 'authorization', 'cookie'].includes(name.toLowerCase()))
      .map(([name, value]) => [name, Array.isArray(value) ? value.join(',') : String(value ?? '')]),
  );
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const rawBody = await buffer(request);
  const body = rawBody.length
    ? (JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>)
    : {};
  if (url.pathname === '/health') return reply(response, 200, { status: 'ok' });
  if (url.pathname === '/__stub/reset' && request.method === 'POST') {
    customers.clear();
    payments.clear();
    webhooks.clear();
    calls.length = 0;
    scenario = 'success';
    return reply(response, 200, { reset: true });
  }
  if (url.pathname === '/__stub/scenario' && request.method === 'POST') {
    scenario = typeof body.scenario === 'string' ? body.scenario : 'success';
    return reply(response, 200, { scenario });
  }
  if (url.pathname === '/__stub/stats' && request.method === 'GET') {
    return reply(response, 200, {
      scenario,
      calls,
      customers: customers.size,
      payments: payments.size,
      webhooks: webhooks.size,
    });
  }

  calls.push({
    method: request.method ?? 'GET',
    path: `${url.pathname}${url.search}`,
    headers: publicHeaders(request.headers),
    body,
  });
  const selected = String(
    request.headers['x-stub-scenario'] ?? url.searchParams.get('scenario') ?? scenario,
  );
  if (!request.headers['user-agent'])
    return reply(response, 400, { errors: [{ description: 'user-agent required' }] });
  const token = request.headers.access_token;
  if (token === 'stub-production-key-000000000000')
    return reply(response, 401, { errors: [{ description: 'environment mismatch' }] });
  if (
    !['stub-sandbox-api-key-000000000000', 'stub-rotated-api-key-000000000000'].includes(
      String(token),
    )
  ) {
    return reply(response, 401, { errors: [{ description: 'invalid access token' }] });
  }
  if (selected === 'error-400')
    return reply(response, 400, { errors: [{ description: 'deterministic bad request' }] });
  if (selected === 'error-401')
    return reply(response, 401, { errors: [{ description: 'deterministic unauthorized' }] });
  if (selected === 'error-429')
    return reply(response, 429, { errors: [{ description: 'deterministic rate limit' }] });
  if (selected === 'error-500')
    return reply(response, 500, { errors: [{ description: 'deterministic provider failure' }] });
  if (selected === 'timeout-before') return void request.socket.destroy();

  if (request.method === 'GET' && url.pathname === '/v3/myAccount/fees/') {
    if (rawBody.length)
      return reply(response, 403, { errors: [{ description: 'GET body forbidden' }] });
    return reply(response, 200, {
      pix: { fixedValue: '0.99', percentage: '0', settlementDays: 0 },
      bankSlip: { fixedValue: '1.49', percentage: '0', settlementDays: 1 },
      creditCard: { fixedValue: '0.49', percentage: '2.99', settlementDays: 30 },
      effectiveConditionMayPrevail: true,
    });
  }

  if (request.method === 'POST' && url.pathname === '/v3/webhooks') {
    const id = `wh_${randomUUID().replaceAll('-', '')}`;
    webhooks.set(id, { id, ...body });
    return reply(response, 200, { id });
  }
  const webhookId = /^\/v3\/webhooks\/([^/]+)$/.exec(url.pathname)?.[1];
  if (request.method === 'DELETE' && webhookId) {
    if (!webhooks.delete(webhookId)) return reply(response, 404, { error: 'webhook not found' });
    return reply(response, 200, { deleted: true });
  }

  if (request.method === 'GET' && url.pathname === '/v3/customers') {
    const reference = url.searchParams.get('externalReference');
    return reply(response, 200, {
      data: [...customers.values()].filter(
        (item) => !reference || item.externalReference === reference,
      ),
    });
  }
  const customerId = /^\/v3\/customers\/([^/]+)$/.exec(url.pathname)?.[1];
  if (request.method === 'GET' && customerId) {
    const customer = customers.get(customerId);
    return customer
      ? reply(response, 200, customer)
      : reply(response, 404, { error: 'customer not found' });
  }
  if (request.method === 'POST' && url.pathname === '/v3/customers') {
    const duplicate = [...customers.values()].find(
      (item) => item.externalReference === body.externalReference,
    );
    if (selected === 'duplicate' && duplicate)
      return reply(response, 400, { errors: [{ description: 'duplicate customer' }] });
    const id = `cus_${randomUUID().replaceAll('-', '')}`;
    const customer = { id, ...body };
    customers.set(id, customer);
    if (selected === 'timeout-after') return void request.socket.destroy();
    return reply(response, 200, customer);
  }

  if (request.method === 'GET' && url.pathname === '/v3/payments') {
    const reference = url.searchParams.get('externalReference');
    return reply(response, 200, {
      data: [...payments.values()].filter(
        (item) => !reference || item.externalReference === reference,
      ),
    });
  }
  const paymentId = /^\/v3\/payments\/([^/]+)$/.exec(url.pathname)?.[1];
  if (request.method === 'GET' && paymentId) {
    const payment = payments.get(paymentId);
    return payment
      ? reply(response, 200, payment)
      : reply(response, 404, { error: 'payment not found' });
  }
  if (request.method === 'POST' && url.pathname === '/v3/payments') {
    if (!customers.has(String(body.customer)))
      return reply(response, 400, { errors: [{ description: 'customer not found' }] });
    const id = `pay_${randomUUID().replaceAll('-', '')}`;
    const payment = {
      id,
      status: 'PENDING',
      invoiceUrl: `http://127.0.0.1:${port}/invoice/${id}`,
      ...body,
    };
    payments.set(id, payment);
    if (selected === 'timeout-after') return void request.socket.destroy();
    return reply(response, 200, payment);
  }
  return reply(response, 404, { error: 'not found' });
});

export function startAsaasStub(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      process.stdout.write(`Asaas stub em http://127.0.0.1:${port}\n`);
      resolve(server);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await startAsaasStub();
