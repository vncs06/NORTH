import type { CurrentActor } from '@north/application';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  actor?: CurrentActor;
  session?: { id: string; csrfHash: string };
  correlationId: string;
}

export interface BootstrapInput {
  companyName: string;
  timezone: string;
  managerName: string;
  managerEmail: string;
  managerPassword: string;
}
