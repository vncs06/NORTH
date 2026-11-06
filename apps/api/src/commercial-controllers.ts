import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  cancelQuoteSchema,
  createCombinationSchema,
  createCustomerSchema,
  createProductSchema,
  createQuoteSchema,
  createTechnicalSheetSchema,
  createTechniqueSchema,
  createVariantSchema,
  putPricingPolicySchema,
  pricingSimulationSchema,
  quotePriceOptionsSchema,
  updateCombinationSchema,
  updateCustomerSchema,
  updateProductSchema,
  updateQuoteSchema,
  updateTechnicalSheetSchema,
  updateTechniqueSchema,
  updateVariantSchema,
} from '@north/contracts';
import { CatalogRepository } from './catalog-repository.js';
import { RequestAuthorization } from './http.js';
import { QuoteRepository } from './quote-repository.js';
import type { AuthenticatedRequest } from './types.js';

@Controller('customers')
export class CustomersController {
  constructor(
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.catalog.listCustomers({ search, status, cursor });
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.catalog.createCustomer(
      actor,
      createCustomerSchema.parse(body),
      request.correlationId,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.catalog.getCustomer(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.catalog.updateCustomer(
      actor,
      id,
      updateCustomerSchema.parse(body),
      request.correlationId,
    );
  }
}

@Controller('catalog')
export class CatalogController {
  constructor(
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get('products')
  async products(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.catalog.listProducts({ search, status, cursor });
  }

  @Post('products')
  async createProduct(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.createProduct(
      actor,
      createProductSchema.parse(body),
      request.correlationId,
    );
  }

  @Get('products/:id')
  async product(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.catalog.getProduct(id);
  }

  @Patch('products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.updateProduct(
      actor,
      id,
      updateProductSchema.parse(body),
      request.correlationId,
    );
  }

  @Get('variants')
  async variants(@Req() request: AuthenticatedRequest, @Query('productId') productId?: string) {
    await this.authorization.require(request);
    return this.catalog.listVariants(productId);
  }

  @Post('variants')
  async createVariant(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.createVariant(
      actor,
      createVariantSchema.parse(body),
      request.correlationId,
    );
  }

  @Get('variants/:id')
  async variant(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.catalog.getVariant(id);
  }

  @Patch('variants/:id')
  async updateVariant(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.updateVariant(
      actor,
      id,
      updateVariantSchema.parse(body),
      request.correlationId,
    );
  }

  @Get('techniques')
  async techniques(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.catalog.listTechniques({ search, status, cursor });
  }

  @Post('techniques')
  async createTechnique(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.createTechnique(
      actor,
      createTechniqueSchema.parse(body),
      request.correlationId,
    );
  }

  @Get('techniques/:id')
  async technique(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.catalog.getTechnique(id);
  }

  @Patch('techniques/:id')
  async updateTechnique(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.updateTechnique(
      actor,
      id,
      updateTechniqueSchema.parse(body),
      request.correlationId,
    );
  }

  @Get('combinations')
  async combinations(@Req() request: AuthenticatedRequest, @Query('status') status?: string) {
    await this.authorization.require(request);
    return this.catalog.listCombinations(status);
  }

  @Post('combinations')
  async createCombination(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.createCombination(
      actor,
      createCombinationSchema.parse(body),
      request.correlationId,
    );
  }

  @Patch('combinations/:id')
  async updateCombination(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.updateCombination(
      actor,
      id,
      updateCombinationSchema.parse(body),
      request.correlationId,
    );
  }
}

@Controller('technical-sheets')
export class TechnicalSheetsController {
  constructor(
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query('combinationId') combinationId?: string) {
    await this.authorization.require(request);
    return this.catalog.listTechnicalSheets(combinationId);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.createTechnicalSheet(
      actor,
      createTechnicalSheetSchema.parse(body),
      request.correlationId,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.catalog.getTechnicalSheet(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.updateTechnicalSheet(
      actor,
      id,
      updateTechnicalSheetSchema.parse(body),
      request.correlationId,
    );
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.activateTechnicalSheet(actor, id, key, request.correlationId);
  }

  @Post(':id/revise')
  async revise(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.reviseTechnicalSheet(actor, id, key, request.correlationId);
  }
}

@Controller('pricing')
export class PricingController {
  constructor(
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
    @Inject(QuoteRepository) private readonly quotes: QuoteRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get('policy')
  async getPolicy(@Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request);
    const policy = await this.catalog.getPricingPolicy();
    if (actor.role === 'MANAGER') return policy;
    return {
      id: policy.id,
      versionNumber: policy.versionNumber,
      status: policy.status,
      method: policy.method,
      rateBps: policy.rateBps,
      effectiveAt: policy.effectiveAt,
      employeeDiscountLimitBps: policy.employeeDiscountLimitBps,
      discountOptionsBps: policy.discountOptionsBps.filter(
        (option) => option <= policy.employeeDiscountLimitBps,
      ),
      components: policy.components.map((component) => ({
        name: component.name,
        type: component.type,
        status: component.status,
        displayOrder: component.displayOrder,
        includeInCostBase: component.includeInCostBase,
      })),
    };
  }

  @Put('policy')
  async putPolicy(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    return this.catalog.putPricingPolicy(
      actor,
      putPricingPolicySchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Get('components')
  async getComponents(@Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request);
    const policy = await this.catalog.getPricingPolicy();
    if (actor.role === 'MANAGER') return { items: policy.components };
    return {
      items: policy.components.map((component) => ({
        name: component.name,
        type: component.type,
        status: component.status,
        displayOrder: component.displayOrder,
        includeInCostBase: component.includeInCostBase,
      })),
    };
  }

  @Get('discounts')
  async getDiscounts(@Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request);
    const policy = await this.catalog.getPricingPolicy();
    return {
      policyId: policy.id,
      employeeLimitBps: policy.employeeDiscountLimitBps,
      ...(actor.role === 'MANAGER' ? { managerLimitBps: policy.managerDiscountLimitBps } : {}),
      optionsBps: policy.discountOptionsBps.filter(
        (option) => actor.role === 'MANAGER' || option <= policy.employeeDiscountLimitBps,
      ),
    };
  }

  @Post('simulations')
  async simulate(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { mutation: true });
    const parsed = pricingSimulationSchema.parse(body);
    return this.quotes.simulateQuote(actor, parsed.quoteId, parsed);
  }
}

@Controller('quotes')
export class QuotesController {
  constructor(
    @Inject(QuoteRepository) private readonly quotes: QuoteRepository,
    @Inject(RequestAuthorization) private readonly authorization: RequestAuthorization,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.authorization.require(request);
    return this.quotes.listQuotes({ status, customerId, cursor });
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.quotes.createQuote(actor, createQuoteSchema.parse(body), request.correlationId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    await this.authorization.require(request);
    return this.quotes.getQuote(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.quotes.updateQuote(actor, id, updateQuoteSchema.parse(body), request.correlationId);
  }

  @Post(':id/simulate')
  async simulate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.quotes.simulateQuote(actor, id, quotePriceOptionsSchema.parse(body));
  }

  @Post(':id/issue')
  async issue(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.quotes.issueQuote(
      actor,
      id,
      quotePriceOptionsSchema.parse(body),
      key,
      request.correlationId,
    );
  }

  @Post(':id/revise')
  async revise(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { mutation: true });
    return this.quotes.reviseQuote(actor, id, key, request.correlationId);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = await this.authorization.require(request, { roles: ['MANAGER'], mutation: true });
    const input = cancelQuoteSchema.parse(body);
    return this.quotes.cancelQuote(actor, id, input.reason, key, request.correlationId);
  }
}
