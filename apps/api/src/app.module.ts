import { Module } from '@nestjs/common';
import {
  AuditController,
  AuthController,
  MaterialsController,
  UsersController,
} from './controllers.js';
import {
  CatalogController,
  CustomersController,
  PricingController,
  QuotesController,
  TechnicalSheetsController,
} from './commercial-controllers.js';
import { CatalogRepository } from './catalog-repository.js';
import { RequestAuthorization, RequestMiddleware } from './http.js';
import { QuoteRepository } from './quote-repository.js';
import { NorthRepository } from './repository.js';

@Module({
  controllers: [
    AuthController,
    UsersController,
    MaterialsController,
    AuditController,
    CustomersController,
    CatalogController,
    TechnicalSheetsController,
    PricingController,
    QuotesController,
  ],
  providers: [
    NorthRepository,
    CatalogRepository,
    QuoteRepository,
    RequestAuthorization,
    RequestMiddleware,
  ],
})
export class AppModule {}
