import { Module } from '@nestjs/common';
import {
  AuditController,
  AuthController,
  MaterialsController,
  UsersController,
} from './controllers.js';
import { RequestAuthorization, RequestMiddleware } from './http.js';
import { NorthRepository } from './repository.js';

@Module({
  controllers: [AuthController, UsersController, MaterialsController, AuditController],
  providers: [NorthRepository, RequestAuthorization, RequestMiddleware],
})
export class AppModule {}
