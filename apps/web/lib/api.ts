export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
  correlationId: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

function cookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method?.toUpperCase() ?? 'GET';
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = cookie('north_csrf');
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}${path}`,
    {
      ...init,
      headers,
      credentials: 'include',
    },
  );
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) throw new ApiError(response.status, body as ApiErrorBody);
  return body as T;
}

export function message(error: unknown): string {
  return error instanceof ApiError
    ? `${error.message} (${error.body.correlationId})`
    : 'Erro inesperado.';
}

export function formatMoney(cents: string | null): string {
  if (cents === null) return 'Não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(cents) / 100,
  );
}

export function formatQuantity(value: string, unit?: string): string {
  const [whole, fraction] = value.split('.');
  const formatted = `${BigInt(whole ?? '0').toLocaleString('pt-BR')}${fraction ? `,${fraction.replace(/0+$/, '')}` : ''}`;
  return `${formatted}${unit ? ` ${unit}` : ''}`;
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}
