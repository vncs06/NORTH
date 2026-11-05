import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  createCompensationSchema,
  createCostSchema,
  createMaterialSchema,
  createMovementSchema,
  createUserSchema,
  loginSchema,
  updateMaterialSchema,
  userStatusSchema,
} from '@north/contracts';
import type { Response } from 'express';
import { RequestAuthorization } from './http.js';
import { NorthRepository } from './repository.js';
import type { AuthenticatedRequest } from './types.js';

const COOKIE = 'north_session';
const CSRF_COOKIE = 'north_csrf';

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Number(process.env.SESSION_TTL_HOURS ?? 12) * 60 * 60 * 1000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(NorthRepository)
    private readonly repository: NorthRepository,
    @Inject(RequestAuthorization)
    private readonly authorization: RequestAuthorization,
  ) {}

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = loginSchema.parse(body);
    const result = await this.repository.login(
      input.email,
      input.password,
      request.ip ?? 'unknown',
      request.correlationId,
    );
    response.cookie(COOKIE, result.token, cookieOptions(true));
    response.cookie(CSRF_COOKIE, result.csrfToken, cookieOptions(false));
    return { user: result.user };
  }

  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    await this.repository.logout(actor, request.correlationId);
    response.clearCookie(COOKIE, cookieOptions(true));
    response.clearCookie(CSRF_COOKIE, cookieOptions(false));
    return { ok: true };
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request);
    return { id: actor.id, name: actor.name, role: actor.role };
  }
}

@Controller('users')
export class UsersController {
  constructor(
    @Inject(NorthRepository)
    private readonly repository: NorthRepository,
    @Inject(RequestAuthorization)
    private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'] });
    return { items: await this.repository.listUsers(actor) };
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.repository.createEmployee(
      actor,
      createUserSchema.parse(body),
      request.correlationId,
    );
  }

  @Patch(':id/status')
  async disable(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    userStatusSchema.parse(body);
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.repository.disableUser(actor, id, request.correlationId);
  }
}

@Controller('materials')
export class MaterialsController {
  constructor(
    @Inject(NorthRepository)
    private readonly repository: NorthRepository,
    @Inject(RequestAuthorization)
    private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.repository.listMaterials({ search, status, cursor });
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.repository.createMaterial(
      actor,
      createMaterialSchema.parse(body),
      request.correlationId,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.repository.getMaterial(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    const result = await this.repository.updateMaterial(
      actor,
      id,
      updateMaterialSchema.parse(body),
      request.correlationId,
    );
    return { ...result, material: await this.repository.getMaterial(id) };
  }

  @Get(':id/costs')
  async costs(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return { items: await this.repository.listCosts(id) };
  }

  @Post(':id/costs')
  async createCost(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.repository.createCost(
      actor,
      id,
      createCostSchema.parse(body),
      request.correlationId,
    );
  }

  @Get(':id/balance')
  async balance(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.repository.getBalance(id);
  }

  @Get(':id/movements')
  async movements(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.repository.listMovements(id, cursor);
  }

  @Post(':id/movements')
  async createMovement(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.repository.createMovement(
      actor,
      id,
      createMovementSchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Post(':id/movements/:movementId/compensations')
  async compensate(
    @Param('id') id: string,
    @Param('movementId') movementId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.repository.compensateMovement(
      actor,
      id,
      movementId,
      createCompensationSchema.parse(body),
      key,
      request.correlationId,
    );
  }
}

@Controller('audit')
export class AuditController {
  constructor(
    @Inject(NorthRepository)
    private readonly repository: NorthRepository,
    @Inject(RequestAuthorization)
    private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    await this.authorization.require(request, { roles: ['MANAGER'] });
    return this.repository.listAudit(query);
  }
}
