import { z } from 'zod';

const uuid = z.string().uuid();
export const resourceIdSchema = uuid;
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const updateBillingDocumentSchema = z.object({
  cpfCnpj: z
    .string()
    .trim()
    .regex(/^\d{11}(?:\d{3})?$/, 'Informe CPF ou CNPJ somente com dígitos.'),
});

export const putDepositPolicySchema = z.object({
  rateBps: z.number().int().min(0).max(10_000),
  minimumAmountCents: cents,
  effectiveAt: z.string().datetime(),
});

export const convertQuoteSchema = z.object({ quoteId: uuid });

export const configureAsaasSchema = z.object({
  environment: z.literal('SANDBOX'),
  apiKey: z.string().trim().min(20).max(500),
  webhookAuthToken: z.string().min(32).max(255).regex(/^\S+$/),
  webhookPublicUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://')),
});

export const createChargeSchema = z.object({
  billingType: z.enum(['PIX', 'BOLETO', 'UNDEFINED']),
  dueDate: z.string().date(),
});

export const receiveWebhookSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    event: z.string().trim().min(1).max(100),
    payment: z
      .object({
        id: z.string().trim().min(1).max(100),
        value: z.number().nonnegative().optional(),
        netValue: z.number().nonnegative().optional(),
        status: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const uploadArtworkSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'application/pdf']),
  contentBase64: z.string().min(4),
});

export const confirmArtworkSchema = z.object({
  customerConfirmationReference: z.string().trim().min(3).max(500),
});

export const approveArtworkSchema = confirmArtworkSchema;

export const evaluateReadinessSchema = z.object({
  confirmStockException: z.boolean().default(false),
  stockExceptionReason: z.string().trim().max(500).optional(),
});

export const financialExceptionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
