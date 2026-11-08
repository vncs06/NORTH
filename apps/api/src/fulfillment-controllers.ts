import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  approveArtworkSchema,
  cancelOrderSchema,
  configureAsaasSchema,
  confirmArtworkSchema,
  convertQuoteSchema,
  createChargeSchema,
  disconnectAsaasSchema,
  evaluateReadinessSchema,
  feePolicySchema,
  financialExceptionSchema,
  putDepositPolicySchema,
  putAsaasPaymentMethodsSchema,
  receiveWebhookSchema,
  rejectArtworkSchema,
  resourceIdSchema,
  rotateAsaasKeySchema,
  rotateAsaasWebhookTokenSchema,
  updateBillingDocumentSchema,
  uploadArtworkSchema,
} from '@north/contracts';
import type { Response } from 'express';
import { FulfillmentRepository } from './fulfillment-repository.js';
import { RequestAuthorization } from './http.js';
import type { AuthenticatedRequest } from './types.js';

@Controller('customers')
export class CustomerBillingController {
  constructor(
    @Inject(FulfillmentRepository) private readonly fulfillment: FulfillmentRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Patch(':id/billing-document')
  async updateBillingDocument(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    const input = updateBillingDocumentSchema.parse(body);
    return this.fulfillment.putBillingDocument(
      actor,
      resourceIdSchema.parse(id),
      input.cpfCnpj,
      request.correlationId,
    );
  }
}

@Controller('order-settings')
export class OrderSettingsController {
  constructor(
    @Inject(FulfillmentRepository) private readonly fulfillment: FulfillmentRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get('deposit-policy')
  async getDepositPolicy(@Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.fulfillment.getDepositPolicy();
  }

  @Put('deposit-policy')
  async putDepositPolicy(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.putDepositPolicy(
      actor,
      putDepositPolicySchema.parse(body),
      key,
      request.correlationId,
    );
  }
}

@Controller('integrations/asaas')
export class AsaasConfigurationController {
  constructor(
    @Inject(FulfillmentRepository) private readonly fulfillment: FulfillmentRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async get(@Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.fulfillment.getAsaasConfiguration();
  }

  @Put()
  async put(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.configureAsaas(
      actor,
      configureAsaasSchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Post('webhook-token/generate')
  async generateWebhookToken(@Req() request: AuthenticatedRequest) {
    await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.generateAsaasWebhookToken();
  }

  @Put('payment-methods')
  async putPaymentMethods(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.putAsaasPaymentMethods(
      actor,
      putAsaasPaymentMethodsSchema.parse(body).methods,
      key,
      request.correlationId,
    );
  }

  @Get('fees')
  async fees(@Req() request: AuthenticatedRequest) {
    await this.authorization.require(request, { roles: ['MANAGER'] });
    return this.fulfillment.getAsaasFees();
  }

  @Post('fees/refresh')
  async refreshFees(@Headers('idempotency-key') key: string, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.refreshAsaasFees(actor, key, request.correlationId);
  }

  @Get('fee-policy')
  async feePolicy(@Req() request: AuthenticatedRequest) {
    await this.authorization.require(request, { roles: ['MANAGER'] });
    return this.fulfillment.getFeePolicy();
  }

  @Put('fee-policy')
  async putFeePolicy(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.putFeePolicy(
      actor,
      feePolicySchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Post('rotate-key')
  async rotate(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.rotateAsaasKey(
      actor,
      rotateAsaasKeySchema.parse(body).apiKey,
      key,
      request.correlationId,
    );
  }

  @Post('rotate-webhook-token')
  async rotateWebhookToken(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.rotateAsaasWebhookToken(
      actor,
      rotateAsaasWebhookTokenSchema.parse(body).webhookAuthToken,
      key,
      request.correlationId,
    );
  }

  @Get('disconnect-impact')
  async disconnectImpact(@Req() request: AuthenticatedRequest) {
    await this.authorization.require(request, { roles: ['MANAGER'] });
    return this.fulfillment.getAsaasDisconnectImpact();
  }

  @Post('disconnect')
  async disconnect(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    disconnectAsaasSchema.parse(body);
    return this.fulfillment.disconnectAsaas(actor, key, request.correlationId);
  }
}

@Controller('artwork-versions')
export class ArtworkVersionsController {
  constructor(
    @Inject(FulfillmentRepository) private readonly fulfillment: FulfillmentRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Post(':id/request-approval')
  async requestApproval(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.fulfillment.requestArtworkApproval(
      actor,
      resourceIdSchema.parse(id),
      key,
      request.correlationId,
    );
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.fulfillment.rejectArtwork(
      actor,
      resourceIdSchema.parse(id),
      rejectArtworkSchema.parse(body),
      key,
      request.correlationId,
    );
  }
}

@Controller('webhooks/asaas')
export class AsaasWebhookController {
  constructor(@Inject(FulfillmentRepository) private readonly fulfillment: FulfillmentRepository) {}

  @Post('payments')
  @HttpCode(200)
  async payment(@Headers('asaas-access-token') token: string | undefined, @Body() body: unknown) {
    return this.fulfillment.receiveWebhook(token, receiveWebhookSchema.parse(body));
  }
}

@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(FulfillmentRepository) private readonly fulfillment: FulfillmentRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.fulfillment.listOrders({ status, cursor });
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    const input = convertQuoteSchema.parse(body);
    return this.fulfillment.convertQuote(actor, input.quoteId, key, request.correlationId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.fulfillment.getOrder(resourceIdSchema.parse(id));
  }

  @Post(':id/charges')
  async createCharge(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.fulfillment.createCharge(
      actor,
      resourceIdSchema.parse(id),
      createChargeSchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Post(':id/artworks')
  async uploadArtwork(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.fulfillment.uploadArtwork(
      actor,
      resourceIdSchema.parse(id),
      uploadArtworkSchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Get(':id/artworks/:artworkId/download')
  async downloadArtwork(
    @Param('id') id: string,
    @Param('artworkId') artworkId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const actor = await this.authorization.require(request);
    const file = await this.fulfillment.readArtwork(
      actor,
      resourceIdSchema.parse(id),
      resourceIdSchema.parse(artworkId),
    );
    response.setHeader('content-type', file.mimeType);
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    response.setHeader('cache-control', 'private, no-store');
    response.send(file.content);
  }

  @Post(':id/artworks/:artworkId/customer-confirmation')
  async confirmArtwork(
    @Param('id') id: string,
    @Param('artworkId') artworkId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    const input = confirmArtworkSchema.parse(body);
    return this.fulfillment.confirmArtwork(
      actor,
      resourceIdSchema.parse(id),
      resourceIdSchema.parse(artworkId),
      input.customerConfirmationReference,
      key,
      request.correlationId,
    );
  }

  @Post(':id/artworks/:artworkId/approve')
  async approveArtwork(
    @Param('id') id: string,
    @Param('artworkId') artworkId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    const input = approveArtworkSchema.parse(body);
    return this.fulfillment.approveArtwork(
      actor,
      resourceIdSchema.parse(id),
      resourceIdSchema.parse(artworkId),
      input.customerConfirmationReference,
      key,
      request.correlationId,
    );
  }

  @Post(':id/financial-exception')
  async financialException(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    const input = financialExceptionSchema.parse(body);
    return this.fulfillment.approveFinancialException(
      actor,
      resourceIdSchema.parse(id),
      input.reason,
      key,
      request.correlationId,
    );
  }

  @Post(':id/evaluate-readiness')
  async evaluate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.fulfillment.evaluateReadiness(
      actor,
      resourceIdSchema.parse(id),
      evaluateReadinessSchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    const input = cancelOrderSchema.parse(body);
    return this.fulfillment.cancelOrder(
      actor,
      resourceIdSchema.parse(id),
      input.reason,
      key,
      request.correlationId,
    );
  }
}
