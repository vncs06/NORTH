import { randomUUID } from 'node:crypto';

export function correlationId(value?: string): string {
  return value && /^[a-zA-Z0-9._-]{8,100}$/.test(value) ? value : randomUUID();
}

export function logEvent(input: {
  level: 'info' | 'warn' | 'error';
  event: string;
  correlationId: string;
  status?: number;
  diagnostic?: string;
}): void {
  process.stdout.write(`${JSON.stringify({ ...input, at: new Date().toISOString() })}\n`);
}

export const openTelemetryPrepared = {
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'north-api',
  enabled: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
};
