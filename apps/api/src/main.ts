import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter, RequestMiddleware } from './http.js';
import type { AuthenticatedRequest } from './types.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  const requestMiddleware = new RequestMiddleware();
  app.use((request: Request, response: Response, next: () => void) =>
    requestMiddleware.use(request as AuthenticatedRequest, response, next),
  );
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['content-type', 'idempotency-key', 'x-correlation-id', 'x-csrf-token'],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use((request: Request, response: Response, next: () => void) => {
    if (request.path === '/api/v1/health') response.json({ status: 'ok' });
    else next();
  });
  return app;
}

if (process.env.NODE_ENV !== 'test' || process.env.START_HTTP_SERVER === 'true') {
  const app = await createApp();
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}
