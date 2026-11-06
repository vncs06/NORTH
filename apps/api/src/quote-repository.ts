import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CurrentActor, Page } from '@north/application';
import type { DatabaseClient } from '@north/database';
import { pool, transaction } from '@north/database';
import {
  addQuantities,
  assertRole,
  calculateInventoryBalance,
  DomainError,
  quantityToScaled,
} from '@north/domain';
import {
  applyDiscount,
  calculateAdditionalComponentCents,
  calculateConsumption,
  calculateMaterialCostCents,
  calculateSuggestedPriceCents,
  confirmManualPrice,
  type PricingComponentType,
  type PricingMethod,
} from '@north/domain/commercial';
import { CatalogRepository } from './catalog-repository.js';
import {
  commercialAudit,
  decodeCommercialCursor,
  encodeCommercialCursor,
  lockIdempotency,
  recordIdempotency,
} from './commercial-shared.js';

interface QuoteItemInput {
  combinationId: string;
  quantity: string;
}

interface PriceOptions {
  discountBps: number;
  manualFinalPriceCents?: number;
  manualReason?: string;
}

interface QuoteRow {
  id: string;
  commercialNumber: string;
  revisionNumber: number;
  previousQuoteId: string | null;
  rootQuoteId: string;
  customerId: string;
  status: 'DRAFT' | 'ISSUED' | 'SUPERSEDED' | 'CANCELLED';
  version: number;
  pricingPolicyId: string | null;
  discountPolicyId: string | null;
  pricingMethod: PricingMethod | null;
  pricingRateBps: number | null;
  discountBps: number | null;
  materialCostCents: string | null;
  additionalCostCents: string | null;
  costBaseCents: string | null;
  suggestedPriceCents: string | null;
  discountCents: string | null;
  suggestedFinalCents: string | null;
  manualFinalCents: string | null;
  manualAdjustmentReason: string | null;
  finalPriceCents: string | null;
  customerTypeSnapshot: string | null;
  customerDisplayNameSnapshot: string | null;
  customerBusinessNameSnapshot: string | null;
  snapshotJson: unknown;
  createdBy: string;
  issuedBy: string | null;
  issuedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DraftItemRow {
  id: string;
  combinationId: string;
  requestedQuantity: string;
  displayOrder: number;
  combinationStatus: string;
  productCode: string;
  productName: string;
  productStatus: string;
  variantCode: string;
  variantName: string;
  variantStatus: string;
  techniqueCode: string;
  techniqueName: string;
  techniqueStatus: string;
}

interface CalculatedMaterial {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  componentQuantity: string;
  baseConsumption: string;
  lossQuantity: string;
  totalConsumption: string;
  lossBps: number;
  unitCostCents: number;
  totalCostCents: number;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  insufficientStock: boolean;
  materialCostId: string;
}

interface CalculatedItem {
  id: string;
  combinationId: string;
  requestedQuantity: string;
  displayOrder: number;
  productCode: string;
  productName: string;
  variantCode: string;
  variantName: string;
  techniqueCode: string;
  techniqueName: string;
  technicalSheetId: string;
  technicalSheetVersion: number;
  yieldQuantity: string;
  lossBps: number;
  materialCostCents: number;
  insufficientStock: boolean;
  materials: CalculatedMaterial[];
}

interface CalculatedPriceComponent {
  id: string;
  name: string;
  type: PricingComponentType;
  amountCents: number | null;
  rateBps: number | null;
  calculatedCents: number;
  includeInCostBase: boolean;
  displayOrder: number;
}

interface QuoteCalculation {
  quoteId: string;
  customer: {
    id: string;
    type: 'PERSON' | 'COMPANY';
    displayName: string;
    businessName: string | null;
  };
  items: CalculatedItem[];
  pricingPolicy: {
    id: string;
    versionNumber: number;
    method: PricingMethod;
    rateBps: number;
    discountPolicyId: string;
    employeeLimitBps: number;
    managerLimitBps: number;
  };
  priceComponents: CalculatedPriceComponent[];
  materialCostCents: number;
  additionalCostCents: number;
  costBaseCents: number;
  suggestedPriceCents: number;
  discountBps: number;
  discountCents: number;
  suggestedFinalCents: number;
  manualFinalPriceCents: number | null;
  manualReason: string | null;
  finalPriceCents: number;
  adjusted: boolean;
}

@Injectable()
export class QuoteRepository {
  private readonly catalog = new CatalogRepository();

  private async quoteRow(
    id: string,
    client: Pick<DatabaseClient, 'query'> = pool,
    forUpdate = false,
  ): Promise<QuoteRow> {
    const result = await client.query<QuoteRow>(
      `SELECT id,commercial_number AS "commercialNumber",revision_number AS "revisionNumber",
              previous_quote_id AS "previousQuoteId",root_quote_id AS "rootQuoteId",
              customer_id AS "customerId",status,version,pricing_policy_id AS "pricingPolicyId",
              discount_policy_id AS "discountPolicyId",pricing_method AS "pricingMethod",
              pricing_rate_bps AS "pricingRateBps",discount_bps AS "discountBps",
              material_cost_cents::text AS "materialCostCents",
              additional_cost_cents::text AS "additionalCostCents",
              cost_base_cents::text AS "costBaseCents",
              suggested_price_cents::text AS "suggestedPriceCents",
              discount_cents::text AS "discountCents",
              suggested_final_cents::text AS "suggestedFinalCents",
              manual_final_cents::text AS "manualFinalCents",
              manual_adjustment_reason AS "manualAdjustmentReason",
              final_price_cents::text AS "finalPriceCents",
              customer_type_snapshot AS "customerTypeSnapshot",
              customer_display_name_snapshot AS "customerDisplayNameSnapshot",
              customer_business_name_snapshot AS "customerBusinessNameSnapshot",
              snapshot_json AS "snapshotJson",created_by AS "createdBy",issued_by AS "issuedBy",
              issued_at AS "issuedAt",cancelled_by AS "cancelledBy",cancelled_at AS "cancelledAt",
              cancellation_reason AS "cancellationReason",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM quotes WHERE id=$1 ${forUpdate ? 'FOR UPDATE' : ''}`,
      [id],
    );
    const quote = result.rows[0];
    if (!quote) throw new DomainError('QUOTE_NOT_FOUND', 'Orçamento não encontrado.', 404);
    return quote;
  }

  private async nextCommercialNumber(client: DatabaseClient): Promise<string> {
    const result = await client.query<{ number: string }>(
      `SELECT 'ORC-' || to_char(clock_timestamp() AT TIME ZONE 'America/Manaus','YYYY') ||
              '-' || lpad(nextval('quote_commercial_number_seq')::text,6,'0') AS number`,
    );
    return result.rows[0]!.number;
  }

  async createQuote(
    actor: CurrentActor,
    input: { customerId: string; items: QuoteItemInput[] },
    correlationId: string,
  ) {
    return transaction(async (client) => {
      await this.catalog.getCustomer(input.customerId, client);
      for (const item of input.items) await this.catalog.getCombination(item.combinationId, client);
      const id = randomUUID();
      const number = await this.nextCommercialNumber(client);
      await client.query(
        `INSERT INTO quotes
           (id,commercial_number,revision_number,root_quote_id,customer_id,status,created_by,updated_by)
         VALUES($1,$2,1,$1,$3,'DRAFT',$4,$4)`,
        [id, number, input.customerId, actor.id],
      );
      for (const [index, item] of input.items.entries()) {
        await client.query(
          `INSERT INTO quote_items
             (id,quote_id,combination_id,requested_quantity,display_order)
           VALUES($1,$2,$3,$4,$5)`,
          [randomUUID(), id, item.combinationId, item.quantity, index],
        );
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'QUOTE_DRAFT_CREATED',
        resourceType: 'quote',
        resourceId: id,
        correlationId,
        after: {
          commercialNumber: number,
          revisionNumber: 1,
          status: 'DRAFT',
          itemCount: input.items.length,
        },
      });
      return this.getQuote(id, client);
    }, 'SERIALIZABLE');
  }

  async updateQuote(
    actor: CurrentActor,
    id: string,
    input: { version: number; customerId?: string; items?: QuoteItemInput[] },
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const current = await this.quoteRow(id, client, true);
      if (current.status !== 'DRAFT') {
        throw new DomainError(
          'QUOTE_IMMUTABLE',
          'Orçamento emitido é imutável; crie uma revisão.',
          409,
        );
      }
      if (current.version !== input.version) {
        throw new DomainError(
          'QUOTE_VERSION_CONFLICT',
          'O orçamento foi alterado por outra sessão.',
          409,
        );
      }
      const customerId = input.customerId ?? current.customerId;
      await this.catalog.getCustomer(customerId, client);
      if (input.items) {
        for (const item of input.items)
          await this.catalog.getCombination(item.combinationId, client);
      }
      const updated = await client.query(
        `UPDATE quotes
         SET customer_id=$2,version=version+1,updated_by=$3,updated_at=clock_timestamp()
         WHERE id=$1 AND version=$4`,
        [id, customerId, actor.id, input.version],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError(
          'QUOTE_VERSION_CONFLICT',
          'O orçamento foi alterado por outra sessão.',
          409,
        );
      }
      if (input.items) {
        await client.query('DELETE FROM quote_items WHERE quote_id=$1', [id]);
        for (const [index, item] of input.items.entries()) {
          await client.query(
            `INSERT INTO quote_items
               (id,quote_id,combination_id,requested_quantity,display_order)
             VALUES($1,$2,$3,$4,$5)`,
            [randomUUID(), id, item.combinationId, item.quantity, index],
          );
        }
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'QUOTE_DRAFT_UPDATED',
        resourceType: 'quote',
        resourceId: id,
        correlationId,
        before: { version: current.version, customerId: current.customerId },
        after: {
          version: current.version + 1,
          customerId,
          ...(input.items ? { itemCount: input.items.length } : {}),
        },
      });
      return this.getQuote(id, client);
    });
  }

  async listQuotes(input: {
    status?: string;
    customerId?: string;
    cursor?: string;
  }): Promise<Page<unknown>> {
    const cursor = decodeCommercialCursor(input.cursor);
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.status) {
      values.push(input.status);
      where.push(`q.status=$${values.length}`);
    }
    if (input.customerId) {
      values.push(input.customerId);
      where.push(`q.customer_id=$${values.length}::uuid`);
    }
    if (cursor) {
      values.push(cursor.value, cursor.id);
      where.push(
        `(q.created_at,q.id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`,
      );
    }
    values.push(21);
    const result = await pool.query<{
      id: string;
      commercialNumber: string;
      revisionNumber: number;
      status: string;
      customerId: string;
      customerName: string;
      finalPriceCents: string | null;
      createdAt: Date;
      issuedAt: Date | null;
    }>(
      `SELECT q.id,q.commercial_number AS "commercialNumber",q.revision_number AS "revisionNumber",
              q.status,q.customer_id AS "customerId",
              COALESCE(q.customer_display_name_snapshot,c.display_name) AS "customerName",
              q.final_price_cents::text AS "finalPriceCents",q.created_at AS "createdAt",
              q.issued_at AS "issuedAt"
       FROM quotes q JOIN customers c ON c.id=q.customer_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY q.created_at DESC,q.id DESC LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 20;
    const items = result.rows.slice(0, 20);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCommercialCursor({ value: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async getQuote(id: string, client: Pick<DatabaseClient, 'query'> = pool) {
    const quote = await this.quoteRow(id, client);
    const customer = await this.catalog.getCustomer(quote.customerId, client);
    const items = await client.query<{
      id: string;
      combinationId: string;
      requestedQuantity: string;
      displayOrder: number;
      productCode: string;
      productName: string;
      variantCode: string;
      variantName: string;
      techniqueCode: string;
      techniqueName: string;
      technicalSheetId: string | null;
      technicalSheetVersion: number | null;
      yieldQuantity: string | null;
      lossBps: number | null;
      materialCostCents: string | null;
      insufficientStock: boolean | null;
    }>(
      `SELECT i.id,i.combination_id AS "combinationId",i.requested_quantity::text AS "requestedQuantity",
              i.display_order AS "displayOrder",
              COALESCE(i.product_code_snapshot,p.code) AS "productCode",
              COALESCE(i.product_name_snapshot,p.name) AS "productName",
              COALESCE(i.variant_code_snapshot,v.code) AS "variantCode",
              COALESCE(i.variant_name_snapshot,v.name) AS "variantName",
              COALESCE(i.technique_code_snapshot,t.code) AS "techniqueCode",
              COALESCE(i.technique_name_snapshot,t.name) AS "techniqueName",
              i.technical_sheet_id AS "technicalSheetId",
              i.technical_sheet_version AS "technicalSheetVersion",
              i.yield_quantity_snapshot::text AS "yieldQuantity",
              i.loss_bps_snapshot AS "lossBps",i.material_cost_cents::text AS "materialCostCents",
              i.insufficient_stock AS "insufficientStock"
       FROM quote_items i
       JOIN catalog_combinations c ON c.id=i.combination_id
       JOIN products p ON p.id=c.product_id
       JOIN product_variants v ON v.id=c.variant_id
       JOIN customization_techniques t ON t.id=c.technique_id
       WHERE i.quote_id=$1 ORDER BY i.display_order,i.id`,
      [id],
    );
    const materials = await client.query(
      `SELECT m.id,m.quote_item_id AS "quoteItemId",m.material_id AS "materialId",
              m.material_code AS "materialCode",m.material_name AS "materialName",m.unit,
              m.component_quantity::text AS "componentQuantity",
              m.base_consumption::text AS "baseConsumption",
              m.loss_quantity::text AS "lossQuantity",
              m.total_consumption::text AS "totalConsumption",m.loss_bps AS "lossBps",
              m.unit_cost_cents::text AS "unitCostCents",
              m.total_cost_cents::text AS "totalCostCents",
              m.physical_quantity::text AS "physicalQuantity",
              m.reserved_quantity::text AS "reservedQuantity",
              m.available_quantity::text AS "availableQuantity",
              m.insufficient_stock AS "insufficientStock",m.material_cost_id AS "materialCostId"
       FROM quote_material_snapshots m
       JOIN quote_items i ON i.id=m.quote_item_id WHERE i.quote_id=$1
       ORDER BY i.display_order,m.created_at,m.id`,
      [id],
    );
    const priceComponents = await client.query(
      `SELECT id,pricing_component_id AS "pricingComponentId",name,type,
              amount_cents::text AS "amountCents",rate_bps AS "rateBps",
              calculated_cents::text AS "calculatedCents",
              include_in_cost_base AS "includeInCostBase",display_order AS "displayOrder"
       FROM quote_pricing_component_snapshots WHERE quote_id=$1 ORDER BY display_order,id`,
      [id],
    );
    const previous = quote.previousQuoteId
      ? await client.query<{ id: string; commercialNumber: string; finalPriceCents: string }>(
          `SELECT id,commercial_number AS "commercialNumber",
                  final_price_cents::text AS "finalPriceCents"
           FROM quotes WHERE id=$1`,
          [quote.previousQuoteId],
        )
      : null;
    return {
      ...quote,
      customer:
        quote.status === 'DRAFT'
          ? customer
          : {
              id: customer.id,
              type: quote.customerTypeSnapshot,
              displayName: quote.customerDisplayNameSnapshot,
              businessName: quote.customerBusinessNameSnapshot,
            },
      items: items.rows.map((item) => ({
        ...item,
        materials: materials.rows.filter(
          (material: { quoteItemId: string }) => material.quoteItemId === item.id,
        ),
      })),
      priceComponents: priceComponents.rows,
      previous: previous?.rows[0] ?? null,
    };
  }

  private async draftItems(client: DatabaseClient, quoteId: string): Promise<DraftItemRow[]> {
    const result = await client.query<DraftItemRow>(
      `SELECT i.id,i.combination_id AS "combinationId",
              i.requested_quantity::text AS "requestedQuantity",i.display_order AS "displayOrder",
              c.status AS "combinationStatus",p.code AS "productCode",p.name AS "productName",
              p.status AS "productStatus",v.code AS "variantCode",v.name AS "variantName",
              v.status AS "variantStatus",t.code AS "techniqueCode",t.name AS "techniqueName",
              t.status AS "techniqueStatus"
       FROM quote_items i
       JOIN catalog_combinations c ON c.id=i.combination_id
       JOIN products p ON p.id=c.product_id
       JOIN product_variants v ON v.id=c.variant_id
       JOIN customization_techniques t ON t.id=c.technique_id
       WHERE i.quote_id=$1 ORDER BY i.display_order,i.id`,
      [quoteId],
    );
    if (!result.rows.length) {
      throw new DomainError('QUOTE_ITEMS_REQUIRED', 'Inclua ao menos um item no orçamento.', 422);
    }
    return result.rows;
  }

  private async calculate(
    client: DatabaseClient,
    actor: CurrentActor,
    quoteId: string,
    options: PriceOptions,
  ): Promise<QuoteCalculation> {
    const quote = await this.quoteRow(quoteId, client);
    if (quote.status !== 'DRAFT') {
      throw new DomainError(
        'QUOTE_IMMUTABLE',
        'Orçamento emitido é imutável; crie uma revisão.',
        409,
      );
    }
    const customer = await this.catalog.getCustomer(quote.customerId, client);
    if (customer.status !== 'ACTIVE') {
      throw new DomainError('CUSTOMER_INACTIVE', 'Ative o cliente antes de emitir.', 422);
    }
    const items = await this.draftItems(client, quoteId);
    const calculatedItems: CalculatedItem[] = [];
    let materialCostCents = 0;
    let totalQuantity = '0';
    for (const item of items) {
      if (
        [item.combinationStatus, item.productStatus, item.variantStatus, item.techniqueStatus].some(
          (status) => status !== 'ACTIVE',
        )
      ) {
        throw new DomainError(
          'CATALOG_COMBINATION_INACTIVE',
          'Produto, variante, técnica e combinação devem estar ativos.',
          422,
        );
      }
      const sheet = await client.query<{
        id: string;
        versionNumber: number;
        yieldQuantity: string;
        lossBps: number;
      }>(
        `SELECT id,version_number AS "versionNumber",yield_quantity::text AS "yieldQuantity",
                loss_bps AS "lossBps"
         FROM technical_sheets WHERE combination_id=$1 AND status='ACTIVE'`,
        [item.combinationId],
      );
      const activeSheet = sheet.rows[0];
      if (!activeSheet) {
        throw new DomainError(
          'ACTIVE_TECHNICAL_SHEET_REQUIRED',
          'A combinação não possui ficha técnica ativa.',
          422,
        );
      }
      const components = await client.query<{
        id: string;
        materialId: string;
        componentQuantity: string;
        unit: string;
        materialCode: string;
        materialName: string;
        materialStatus: string;
        baseUnit: string;
        physicalQuantity: string;
        reservedQuantity: string;
        materialCostId: string | null;
        unitCostCents: string | null;
      }>(
        `SELECT c.id,c.material_id AS "materialId",c.quantity::text AS "componentQuantity",c.unit,
                m.code AS "materialCode",m.name AS "materialName",m.status AS "materialStatus",
                m.base_unit AS "baseUnit",b.physical_quantity::text AS "physicalQuantity",
                b.reserved_quantity::text AS "reservedQuantity",mc.id AS "materialCostId",
                mc.amount_cents::text AS "unitCostCents"
         FROM technical_sheet_components c
         JOIN materials m ON m.id=c.material_id
         JOIN inventory_balances b ON b.material_id=m.id
         LEFT JOIN LATERAL (
           SELECT id,amount_cents FROM material_costs
           WHERE material_id=m.id AND effective_at<=clock_timestamp()
           ORDER BY effective_at DESC,created_at DESC,id DESC LIMIT 1
         ) mc ON true
         WHERE c.technical_sheet_id=$1 ORDER BY c.display_order,c.id`,
        [activeSheet.id],
      );
      const calculatedMaterials: CalculatedMaterial[] = [];
      let itemMaterialCost = 0;
      for (const component of components.rows) {
        if (component.materialStatus !== 'ACTIVE') {
          throw new DomainError(
            'MATERIAL_INACTIVE',
            `O material ${component.materialCode} está inativo.`,
            422,
          );
        }
        if (component.unit !== component.baseUnit) {
          throw new DomainError(
            'MATERIAL_UNIT_MISMATCH',
            'A unidade da ficha é incompatível.',
            422,
          );
        }
        if (!component.materialCostId || component.unitCostCents === null) {
          throw new DomainError(
            'MATERIAL_COST_MISSING',
            `O material ${component.materialCode} não possui custo vigente.`,
            422,
            { materialId: component.materialId },
          );
        }
        const consumption = calculateConsumption({
          requestedQuantity: item.requestedQuantity,
          yieldQuantity: activeSheet.yieldQuantity,
          componentQuantity: component.componentQuantity,
          lossBps: activeSheet.lossBps,
        });
        const cost = calculateMaterialCostCents(
          consumption.totalQuantity,
          Number(component.unitCostCents),
        );
        const balance = calculateInventoryBalance(
          component.physicalQuantity,
          component.reservedQuantity,
        );
        const insufficient =
          quantityToScaled(consumption.totalQuantity) > quantityToScaled(balance.available);
        itemMaterialCost += cost;
        calculatedMaterials.push({
          id: component.id,
          materialId: component.materialId,
          materialCode: component.materialCode,
          materialName: component.materialName,
          unit: component.unit,
          componentQuantity: component.componentQuantity,
          baseConsumption: consumption.baseQuantity,
          lossQuantity: consumption.lossQuantity,
          totalConsumption: consumption.totalQuantity,
          lossBps: activeSheet.lossBps,
          unitCostCents: Number(component.unitCostCents),
          totalCostCents: cost,
          physicalQuantity: balance.physical,
          reservedQuantity: balance.reserved,
          availableQuantity: balance.available,
          insufficientStock: insufficient,
          materialCostId: component.materialCostId,
        });
      }
      materialCostCents += itemMaterialCost;
      totalQuantity = addQuantities(totalQuantity, item.requestedQuantity);
      calculatedItems.push({
        ...item,
        technicalSheetId: activeSheet.id,
        technicalSheetVersion: activeSheet.versionNumber,
        yieldQuantity: activeSheet.yieldQuantity,
        lossBps: activeSheet.lossBps,
        materialCostCents: itemMaterialCost,
        insufficientStock: calculatedMaterials.some((material) => material.insufficientStock),
        materials: calculatedMaterials,
      });
    }
    const policy = await this.catalog.getPricingPolicy(client);
    const discount = await client.query<{ id: string }>(
      'SELECT id FROM discount_policies WHERE pricing_policy_id=$1',
      [policy.id],
    );
    const priceComponents: CalculatedPriceComponent[] = [];
    let additionalCostCents = 0;
    let includedAdditionalCents = 0;
    for (const component of policy.components.filter(
      (candidate) => candidate.status === 'ACTIVE',
    )) {
      const calculated = calculateAdditionalComponentCents({
        type: component.type,
        amountCents: component.amountCents === null ? undefined : Number(component.amountCents),
        rateBps: component.rateBps ?? undefined,
        totalQuantity,
        materialCostCents,
      });
      additionalCostCents += calculated;
      if (component.includeInCostBase) includedAdditionalCents += calculated;
      priceComponents.push({
        id: component.id,
        name: component.name,
        type: component.type,
        amountCents: component.amountCents === null ? null : Number(component.amountCents),
        rateBps: component.rateBps,
        calculatedCents: calculated,
        includeInCostBase: component.includeInCostBase,
        displayOrder: component.displayOrder,
      });
    }
    const costBaseCents = materialCostCents + includedAdditionalCents;
    const suggestedPriceCents = calculateSuggestedPriceCents(
      costBaseCents,
      policy.method,
      policy.rateBps,
    );
    const discounted = applyDiscount({
      suggestedPriceCents,
      discountBps: options.discountBps,
      role: actor.role,
      employeeLimitBps: policy.employeeDiscountLimitBps,
      managerLimitBps: policy.managerDiscountLimitBps,
    });
    if (!policy.discountOptionsBps.includes(options.discountBps)) {
      throw new DomainError(
        'DISCOUNT_OPTION_NOT_AVAILABLE',
        'Selecione uma opção de desconto configurada na política vigente.',
        422,
      );
    }
    const manual = confirmManualPrice({
      role: actor.role,
      suggestedFinalCents: discounted.finalPriceCents,
      confirmedFinalCents: options.manualFinalPriceCents,
      reason: options.manualReason,
    });
    return {
      quoteId,
      customer: {
        id: customer.id,
        type: customer.type,
        displayName: customer.displayName,
        businessName: customer.businessName,
      },
      items: calculatedItems,
      pricingPolicy: {
        id: policy.id,
        versionNumber: policy.versionNumber,
        method: policy.method,
        rateBps: policy.rateBps,
        discountPolicyId: discount.rows[0]!.id,
        employeeLimitBps: policy.employeeDiscountLimitBps,
        managerLimitBps: policy.managerDiscountLimitBps,
      },
      priceComponents,
      materialCostCents,
      additionalCostCents,
      costBaseCents,
      suggestedPriceCents,
      discountBps: options.discountBps,
      discountCents: discounted.discountCents,
      suggestedFinalCents: discounted.finalPriceCents,
      manualFinalPriceCents: options.manualFinalPriceCents ?? null,
      manualReason: options.manualReason?.trim() || null,
      finalPriceCents: manual.finalPriceCents,
      adjusted: manual.adjusted,
    };
  }

  async simulateQuote(actor: CurrentActor, id: string, options: PriceOptions) {
    return transaction((client) => this.calculate(client, actor, id, options), 'SERIALIZABLE');
  }

  async issueQuote(
    actor: CurrentActor,
    id: string,
    options: PriceOptions,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const idempotency = await lockIdempotency(client, {
        scope: `POST:/quotes/${id}/issue`,
        key: idempotencyKey,
        payload: { id, ...options },
      });
      if (idempotency.replayResourceId) return this.getQuote(id, client);
      const locked = await this.quoteRow(id, client, true);
      if (locked.status !== 'DRAFT') {
        throw new DomainError(
          'QUOTE_NOT_DRAFT',
          'Somente orçamento em rascunho pode ser emitido.',
          409,
        );
      }
      const calculation = await this.calculate(client, actor, id, options);
      for (const item of calculation.items) {
        await client.query(
          `UPDATE quote_items
           SET product_code_snapshot=$2,product_name_snapshot=$3,variant_code_snapshot=$4,
               variant_name_snapshot=$5,technique_code_snapshot=$6,technique_name_snapshot=$7,
               technical_sheet_id=$8,technical_sheet_version=$9,yield_quantity_snapshot=$10,
               loss_bps_snapshot=$11,material_cost_cents=$12,insufficient_stock=$13
           WHERE id=$1`,
          [
            item.id,
            item.productCode,
            item.productName,
            item.variantCode,
            item.variantName,
            item.techniqueCode,
            item.techniqueName,
            item.technicalSheetId,
            item.technicalSheetVersion,
            item.yieldQuantity,
            item.lossBps,
            item.materialCostCents,
            item.insufficientStock,
          ],
        );
        for (const material of item.materials) {
          await client.query(
            `INSERT INTO quote_material_snapshots
               (id,quote_item_id,material_id,material_code,material_name,unit,component_quantity,
                base_consumption,loss_quantity,total_consumption,loss_bps,unit_cost_cents,
                total_cost_cents,physical_quantity,reserved_quantity,available_quantity,
                insufficient_stock,material_cost_id)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              randomUUID(),
              item.id,
              material.materialId,
              material.materialCode,
              material.materialName,
              material.unit,
              material.componentQuantity,
              material.baseConsumption,
              material.lossQuantity,
              material.totalConsumption,
              material.lossBps,
              material.unitCostCents,
              material.totalCostCents,
              material.physicalQuantity,
              material.reservedQuantity,
              material.availableQuantity,
              material.insufficientStock,
              material.materialCostId,
            ],
          );
        }
      }
      for (const component of calculation.priceComponents) {
        await client.query(
          `INSERT INTO quote_pricing_component_snapshots
             (id,quote_id,pricing_component_id,name,type,amount_cents,rate_bps,calculated_cents,
              include_in_cost_base,display_order)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            randomUUID(),
            id,
            component.id,
            component.name,
            component.type,
            component.amountCents,
            component.rateBps,
            component.calculatedCents,
            component.includeInCostBase,
            component.displayOrder,
          ],
        );
      }
      await client.query(
        `UPDATE quotes
         SET status='ISSUED',version=version+1,pricing_policy_id=$2,discount_policy_id=$3,
             pricing_method=$4,pricing_rate_bps=$5,discount_bps=$6,material_cost_cents=$7,
             additional_cost_cents=$8,cost_base_cents=$9,suggested_price_cents=$10,
             discount_cents=$11,suggested_final_cents=$12,manual_final_cents=$13,
             manual_adjustment_reason=$14,final_price_cents=$15,
             customer_type_snapshot=$16,customer_display_name_snapshot=$17,
             customer_business_name_snapshot=$18,snapshot_json=$19::jsonb,
             issued_by=$20,issued_at=clock_timestamp(),updated_by=$20,updated_at=clock_timestamp()
         WHERE id=$1`,
        [
          id,
          calculation.pricingPolicy.id,
          calculation.pricingPolicy.discountPolicyId,
          calculation.pricingPolicy.method,
          calculation.pricingPolicy.rateBps,
          calculation.discountBps,
          calculation.materialCostCents,
          calculation.additionalCostCents,
          calculation.costBaseCents,
          calculation.suggestedPriceCents,
          calculation.discountCents,
          calculation.suggestedFinalCents,
          calculation.manualFinalPriceCents,
          calculation.manualReason,
          calculation.finalPriceCents,
          calculation.customer.type,
          calculation.customer.displayName,
          calculation.customer.businessName,
          JSON.stringify({
            customer: calculation.customer,
            pricingPolicy: calculation.pricingPolicy,
            totals: {
              materialCostCents: calculation.materialCostCents,
              additionalCostCents: calculation.additionalCostCents,
              costBaseCents: calculation.costBaseCents,
              suggestedPriceCents: calculation.suggestedPriceCents,
              discountCents: calculation.discountCents,
              finalPriceCents: calculation.finalPriceCents,
            },
          }),
          actor.id,
        ],
      );
      if (locked.previousQuoteId) {
        await client.query(
          `UPDATE quotes SET status='SUPERSEDED',updated_at=clock_timestamp()
           WHERE id=$1 AND status='ISSUED'`,
          [locked.previousQuoteId],
        );
      }
      await recordIdempotency(client, {
        scope: `POST:/quotes/${id}/issue`,
        key: idempotencyKey,
        hash: idempotency.hash,
        resourceType: 'quote',
        resourceId: id,
        status: 201,
      });
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'QUOTE_ISSUED',
        resourceType: 'quote',
        resourceId: id,
        correlationId,
        before: { status: 'DRAFT' },
        after: {
          status: 'ISSUED',
          finalPriceCents: calculation.finalPriceCents,
          pricingPolicyVersion: calculation.pricingPolicy.versionNumber,
          itemCount: calculation.items.length,
        },
        metadata: {
          discountBps: calculation.discountBps,
          adjusted: calculation.adjusted,
          insufficientStock: calculation.items.some((item) => item.insufficientStock),
        },
      });
      return this.getQuote(id, client);
    }, 'SERIALIZABLE');
  }

  async reviseQuote(
    actor: CurrentActor,
    id: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const idempotency = await lockIdempotency(client, {
        scope: `POST:/quotes/${id}/revise`,
        key: idempotencyKey,
        payload: { id },
      });
      if (idempotency.replayResourceId) {
        return this.getQuote(idempotency.replayResourceId, client);
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `quote-revision:${id}`,
      ]);
      const source = await this.quoteRow(id, client, true);
      if (source.status !== 'ISSUED') {
        throw new DomainError(
          'QUOTE_REVISION_REQUIRES_ISSUED',
          'Revise um orçamento emitido.',
          409,
        );
      }
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM quotes WHERE previous_quote_id=$1 AND status='DRAFT' LIMIT 1`,
        [id],
      );
      if (existing.rows[0]) {
        throw new DomainError(
          'QUOTE_REVISION_ALREADY_EXISTS',
          'Já existe uma revisão em rascunho para este orçamento.',
          409,
        );
      }
      const revisionId = randomUUID();
      const number = await this.nextCommercialNumber(client);
      await client.query(
        `INSERT INTO quotes
           (id,commercial_number,revision_number,previous_quote_id,root_quote_id,customer_id,status,
            created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,'DRAFT',$7,$7)`,
        [
          revisionId,
          number,
          source.revisionNumber + 1,
          source.id,
          source.rootQuoteId,
          source.customerId,
          actor.id,
        ],
      );
      await client.query(
        `INSERT INTO quote_items
           (id,quote_id,combination_id,requested_quantity,display_order)
         SELECT gen_random_uuid(),$1,combination_id,requested_quantity,display_order
         FROM quote_items WHERE quote_id=$2 ORDER BY display_order,id`,
        [revisionId, id],
      );
      await recordIdempotency(client, {
        scope: `POST:/quotes/${id}/revise`,
        key: idempotencyKey,
        hash: idempotency.hash,
        resourceType: 'quote',
        resourceId: revisionId,
        status: 201,
      });
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'QUOTE_REVISION_CREATED',
        resourceType: 'quote',
        resourceId: revisionId,
        correlationId,
        after: {
          previousQuoteId: id,
          revisionNumber: source.revisionNumber + 1,
          status: 'DRAFT',
        },
      });
      return this.getQuote(revisionId, client);
    }, 'SERIALIZABLE');
  }

  async cancelQuote(
    actor: CurrentActor,
    id: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const idempotency = await lockIdempotency(client, {
        scope: `POST:/quotes/${id}/cancel`,
        key: idempotencyKey,
        payload: { id, reason },
      });
      if (idempotency.replayResourceId) return this.getQuote(id, client);
      const current = await this.quoteRow(id, client, true);
      if (current.status !== 'ISSUED') {
        throw new DomainError('QUOTE_CANCEL_REQUIRES_ISSUED', 'Cancele um orçamento emitido.', 409);
      }
      await client.query(
        `UPDATE quotes
         SET status='CANCELLED',cancelled_by=$2,cancelled_at=clock_timestamp(),
             cancellation_reason=$3,updated_at=clock_timestamp()
         WHERE id=$1`,
        [id, actor.id, reason.trim()],
      );
      await recordIdempotency(client, {
        scope: `POST:/quotes/${id}/cancel`,
        key: idempotencyKey,
        hash: idempotency.hash,
        resourceType: 'quote',
        resourceId: id,
      });
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'QUOTE_CANCELLED',
        resourceType: 'quote',
        resourceId: id,
        correlationId,
        before: { status: 'ISSUED' },
        after: { status: 'CANCELLED', reason: reason.trim() },
      });
      return this.getQuote(id, client);
    });
  }
}
