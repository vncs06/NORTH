import { z } from 'zod';

const uuid = z.string().uuid();
const positiveQuantity = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((value) => !/^0(?:\.0+)?$/.test(value), 'Deve ser maior que zero.');
const status = z.enum(['ACTIVE', 'INACTIVE']);
const code = z.string().trim().min(1).max(40);
const name = z.string().trim().min(2).max(160);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createCustomerSchema = z.object({
  type: z.enum(['PERSON', 'COMPANY']),
  displayName: name,
  businessName: optionalText(200),
  email: z.string().trim().email().max(254).optional(),
  phone: optionalText(40),
  operationalNote: optionalText(1000),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  version: z.number().int().positive(),
  status: status.optional(),
});

export const createProductSchema = z.object({
  code,
  name,
  description: optionalText(1000),
});

export const updateProductSchema = createProductSchema.partial().extend({
  version: z.number().int().positive(),
  status: status.optional(),
});

export const createVariantSchema = z.object({
  productId: uuid,
  code,
  name,
  description: optionalText(1000),
});

export const updateVariantSchema = createVariantSchema.partial().omit({ productId: true }).extend({
  version: z.number().int().positive(),
  status: status.optional(),
});

export const createTechniqueSchema = z.object({
  code,
  name,
  description: optionalText(1000),
});

export const updateTechniqueSchema = createTechniqueSchema.partial().extend({
  version: z.number().int().positive(),
  status: status.optional(),
});

export const createCombinationSchema = z.object({
  productId: uuid,
  variantId: uuid,
  techniqueId: uuid,
});

export const updateCombinationSchema = z.object({
  version: z.number().int().positive(),
  status,
});

const technicalSheetComponent = z.object({
  materialId: uuid,
  quantity: positiveQuantity,
  unit: z.string().trim().min(1).max(12),
});

export const createTechnicalSheetSchema = z.object({
  combinationId: uuid,
  yieldQuantity: positiveQuantity,
  lossBps: z.number().int().nonnegative(),
  technicalNote: optionalText(2000),
  components: z.array(technicalSheetComponent).min(1),
});

export const updateTechnicalSheetSchema = createTechnicalSheetSchema
  .omit({ combinationId: true })
  .partial()
  .extend({
    version: z.number().int().positive(),
    components: z.array(technicalSheetComponent).min(1).optional(),
  });

const pricingComponent = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(['FIXED_QUOTE', 'FIXED_UNIT', 'PERCENT_MATERIAL']),
    amountCents: z.number().int().nonnegative().optional(),
    rateBps: z.number().int().nonnegative().optional(),
    status: status.default('ACTIVE'),
    displayOrder: z.number().int().nonnegative(),
    includeInCostBase: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.type === 'PERCENT_MATERIAL' && value.rateBps === undefined) {
      context.addIssue({ code: 'custom', path: ['rateBps'], message: 'Informe o percentual.' });
    }
    if (value.type !== 'PERCENT_MATERIAL' && value.amountCents === undefined) {
      context.addIssue({ code: 'custom', path: ['amountCents'], message: 'Informe o valor.' });
    }
  });

export const putPricingPolicySchema = z
  .object({
    method: z.enum(['MARKUP', 'MARGIN']),
    rateBps: z.number().int().nonnegative(),
    employeeDiscountLimitBps: z.number().int().min(0).max(10000),
    managerDiscountLimitBps: z.number().int().min(0).max(10000),
    discountOptionsBps: z.array(z.number().int().min(0).max(10000)).min(1),
    effectiveAt: z.string().datetime(),
    components: z.array(pricingComponent),
  })
  .superRefine((value, context) => {
    if (value.method === 'MARGIN' && value.rateBps >= 10000) {
      context.addIssue({
        code: 'custom',
        path: ['rateBps'],
        message: 'A margem deve ser menor que 10000 pontos-base.',
      });
    }
    if (value.employeeDiscountLimitBps > value.managerDiscountLimitBps) {
      context.addIssue({
        code: 'custom',
        path: ['employeeDiscountLimitBps'],
        message: 'O limite do funcionário não pode superar o limite gerencial.',
      });
    }
    if (new Set(value.discountOptionsBps).size !== value.discountOptionsBps.length) {
      context.addIssue({
        code: 'custom',
        path: ['discountOptionsBps'],
        message: 'As opções de desconto não podem se repetir.',
      });
    }
    if (!value.discountOptionsBps.includes(0)) {
      context.addIssue({
        code: 'custom',
        path: ['discountOptionsBps'],
        message: 'A política deve oferecer a opção sem desconto.',
      });
    }
    if (value.discountOptionsBps.some((option) => option > value.managerDiscountLimitBps)) {
      context.addIssue({
        code: 'custom',
        path: ['discountOptionsBps'],
        message: 'Uma opção supera o limite gerencial.',
      });
    }
  });

const quoteItem = z.object({
  combinationId: uuid,
  quantity: positiveQuantity,
});

export const createQuoteSchema = z.object({
  customerId: uuid,
  items: z.array(quoteItem).min(1),
});

export const updateQuoteSchema = createQuoteSchema.partial().extend({
  version: z.number().int().positive(),
  items: z.array(quoteItem).min(1).optional(),
});

export const quotePriceOptionsSchema = z.object({
  discountBps: z.number().int().min(0).max(10000).default(0),
  manualFinalPriceCents: z.number().int().nonnegative().optional(),
  manualReason: optionalText(500),
});

export const pricingSimulationSchema = quotePriceOptionsSchema.extend({ quoteId: uuid });

export const cancelQuoteSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
