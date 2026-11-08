import { z } from 'zod';

const uuid = z.string().uuid();
export const resourceIdSchema = uuid;
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const updateBillingDocumentSchema = z.object({
  cpfCnpj: z.string().trim().min(11).max(18),
});

export const putDepositPolicySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('PERCENTAGE'),
    rateBps: z.number().int().min(0).max(10_000),
    fixedAmountCents: z.null().optional(),
    effectiveAt: z.string().datetime(),
  }),
  z.object({
    mode: z.literal('FIXED_AMOUNT'),
    rateBps: z.null().optional(),
    fixedAmountCents: cents,
    allowAboveTotal: z.boolean().default(false),
    effectiveAt: z.string().datetime(),
  }),
]);

export const convertQuoteSchema = z.object({ quoteId: uuid });

export const configureAsaasSchema = z
  .object({
    environment: z.enum(['SANDBOX', 'PRODUCTION']),
    apiKey: z.string().trim().min(20).max(500),
    notificationEmail: z.string().trim().email().max(320),
    webhookAuthToken: z.string().min(32).max(255).regex(/^\S+$/),
  })
  .superRefine((input, context) => {
    if (input.webhookAuthToken === input.apiKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['webhookAuthToken'],
        message: 'O token do Webhook deve ser diferente da API Key.',
      });
    }
  });

export const putAsaasPaymentMethodsSchema = z.object({
  methods: z.array(z.enum(['PIX', 'BOLETO', 'CREDIT_CARD'])).max(3),
});

export const createChargeSchema = z.object({
  billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
  dueDate: z.string().date(),
});

export const feePolicySchema = z.object({
  effectiveAt: z.string().datetime(),
  methods: z
    .array(
      z.object({
        billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
        strategy: z.enum(['ABSORB', 'PASS_THROUGH']),
      }),
    )
    .length(3),
});

export const rotateAsaasKeySchema = z.object({ apiKey: z.string().trim().min(20).max(500) });
export const rotateAsaasWebhookTokenSchema = z.object({
  webhookAuthToken: z.string().min(32).max(255).regex(/^\S+$/),
});
export const disconnectAsaasSchema = z.object({ confirmImpact: z.literal(true) });

export const requestArtworkApprovalSchema = z.object({});
export const rejectArtworkSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  confirmationSource: z.string().trim().min(3).max(200),
  confirmedAt: z.string().datetime(),
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
