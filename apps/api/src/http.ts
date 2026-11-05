import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Inject,
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import { safeTokenEquals } from '@north/auth';
import { DomainError, assertRole, type Role } from '@north/domain';
import { correlationId, logEvent } from '@north/observability';
import type { NextFunction, Response } from 'express';
import { ZodError } from 'zod';
import { NorthRepository } from './repository.js';
import type { AuthenticatedRequest } from './types.js';

@Injectable()
export class RequestMiddleware implements NestMiddleware {
  use(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
    request.correlationId = correlationId(request.header('x-correlation-id'));
    response.setHeader('x-correlation-id', request.correlationId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    next();
  }
}

@Injectable()
export class RequestAuthorization {
  constructor(@Inject(NorthRepository) private readonly repository: NorthRepository) {}

  async require(
    request: AuthenticatedRequest,
    options: { roles?: Role[]; mutation?: boolean } = {},
  ) {
    const token = request.cookies?.north_session as string | undefined;
    const session = await this.repository.authenticate(token);
    if (!session)
      throw new DomainError('UNAUTHENTICATED', 'Sessão ausente, expirada ou revogada.', 401);
    request.actor = session.actor;
    request.session = { id: session.actor.sessionId, csrfHash: session.csrfHash };
    if (options.roles) assertRole(session.actor.role, options.roles);
    if (options.mutation) {
      const origin = request.header('origin');
      const allowedOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      if (origin !== allowedOrigin) {
        throw new DomainError('INVALID_ORIGIN', 'Origem da requisição não autorizada.', 403);
      }
      const csrf = request.header('x-csrf-token');
      if (!csrf || !safeTokenEquals(session.csrfHash, csrf)) {
        throw new DomainError('INVALID_CSRF_TOKEN', 'Token CSRF ausente ou inválido.', 403);
      }
    }
    return session.actor;
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<Response>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Não foi possível concluir a operação.';
    let details: unknown;
    let diagnostic: string | undefined;
    if (error instanceof DomainError) {
      status = error.status;
      code = error.code;
      message = error.message;
      details = error.details;
    } else if (error instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Revise os campos informados.';
      details = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    } else if ((error as { code?: string }).code === '23505') {
      status = 409;
      code = 'RESOURCE_CONFLICT';
      message = 'O recurso conflita com um registro existente.';
    } else {
      const internal = error as { name?: string; code?: string };
      const safeTypeMessage =
        error instanceof TypeError
          ? `:${error.message.replace(/[^a-zA-Z0-9 _.:()-]/g, '').slice(0, 160)}`
          : '';
      diagnostic = `${internal.name ?? 'UnknownError'}:${internal.code ?? 'NO_CODE'}${safeTypeMessage}`;
    }
    const id = request.correlationId ?? correlationId();
    logEvent({
      level: status >= 500 ? 'error' : 'warn',
      event: code,
      correlationId: id,
      status,
      diagnostic,
    });
    response
      .status(status)
      .json({ code, message, ...(details ? { details } : {}), correlationId: id });
  }
}
