import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';

const port = Number(process.env.ASAAS_STUB_PORT ?? 3199);
const customers = new Map<string, unknown>();
const payments = new Map<string, unknown>();

const server = http.createServer(async (request, response) => {
  const rawBody = await buffer(request);
  const body = rawBody.length
    ? (JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>)
    : {};
  response.setHeader('content-type', 'application/json');
  if (request.method === 'GET' && request.url === '/health') {
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.headers.access_token !== 'stub-sandbox-api-key-000000000000') {
    response.statusCode = 401;
    response.end(JSON.stringify({ errors: [{ description: 'invalid access token' }] }));
    return;
  }
  if (request.method === 'POST' && request.url === '/v3/customers') {
    const id = `cus_${randomUUID().replaceAll('-', '')}`;
    customers.set(id, body);
    response.end(JSON.stringify({ id, ...body }));
    return;
  }
  if (request.method === 'POST' && request.url === '/v3/payments') {
    if (!customers.has(String(body.customer))) {
      response.statusCode = 400;
      response.end(JSON.stringify({ errors: [{ description: 'customer not found' }] }));
      return;
    }
    const id = `pay_${randomUUID().replaceAll('-', '')}`;
    const payment = {
      id,
      status: 'PENDING',
      invoiceUrl: `http://127.0.0.1:${port}/invoice/${id}`,
      ...body,
    };
    payments.set(id, payment);
    response.end(JSON.stringify(payment));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Asaas stub em http://127.0.0.1:${port}\n`);
});
