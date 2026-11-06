import { z } from 'zod';

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const quantity = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);

export const loginSchema = z.object({ email, password });
export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
});
export const userStatusSchema = z.object({ status: z.literal('DISABLED') });

export const createMaterialSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  baseUnit: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}²³._/-]{1,12}$/u),
  minimumStock: quantity.refine((value) => !value.startsWith('-'), 'Deve ser não negativo.'),
});

export const updateMaterialSchema = createMaterialSchema.partial().extend({
  version: z.number().int().positive(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createCostSchema = z.object({
  amountCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  effectiveAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional(),
});

export const createMovementSchema = z.object({
  type: z.enum(['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity,
  reason: z.string().trim().max(500).optional(),
  confirmNegative: z.boolean().default(false),
});

export const createCompensationSchema = z.object({
  quantity: quantity.optional(),
  reason: z.string().trim().min(3).max(500),
  confirmNegative: z.boolean().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;

export interface NorthAdminAuditAccessContract {
  readonly readOnly: true;
  readonly requiresReason: true;
  readonly shortLivedCredential: true;
  readonly separatelyAudited: true;
}

export const northAdminAuditAccess: NorthAdminAuditAccessContract = {
  readOnly: true,
  requiresReason: true,
  shortLivedCredential: true,
  separatelyAudited: true,
};

export * from './commercial.js';
