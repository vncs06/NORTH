import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CurrentActor, Page } from '@north/application';
import { safeTokenEquals } from '@north/auth';
import type { DatabaseClient } from '@north/database';
import { pool, transaction } from '@north/database';
import {
  DomainError,
  quantityToScaled,
  sanitizeBusinessAuditData,
  scaledToQuantity,
} from '@north/domain';
import {
  assertOrderTransition,
  assertStockException,
  calculateDepositCents,
  evaluateOrderReadiness,
  paymentEventStatus,
  type OrderStatus,
} from '@north/domain/fulfillment';
import {
  commercialRequestHash,
  decodeCommercialCursor,
  encodeCommercialCursor,
  lockIdempotency,
  recordIdempotency,
} from './commercial-shared.js';
import {
  AsaasGateway,
  decryptSecret,
  encryptSecret,
  PrivateObjectStorage,
  protectedHash,
  shortFingerprint,
  validateArtworkContent,
} from './fulfillment-infrastructure.js';

interface OrderRow {
  id: string;
  commercialNumber: string;
  quoteId: string;
  customerId: string;
  status: OrderStatus;
  version: number;
  quoteNumberSnapshot: string;
  customerNameSnapshot: string;
  totalAmountCents: string;
  depositPolicyId: string;
  depositPolicyVersion: number;
  depositRateBps: number;
  depositAmountCents: string;
  paidAmountCents: string;
  currentArtworkVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SecretRow {
  id: string;
  apiKeyCiphertext: Buffer;
  apiKeyNonce: Buffer;
  apiKeyAuthTag: Buffer;
  webhookTokenCiphertext: Buffer;
  webhookTokenNonce: Buffer;
  webhookTokenAuthTag: Buffer;
  webhookPublicUrl: string;
  keyFingerprint: string;
}

interface ArtworkDetailRow {
  id: string;
  status: string;
}

interface ReservationDetailRow {
  exceptionConfirmed: boolean;
}

interface AlertDetailRow {
  status: string;
}

interface FinancialDecisionDetailRow {
  type: string;
}

interface AsaasConfigurationView {
  id?: string;
  environment: 'SANDBOX';
  status: string;
  webhookPublicUrl?: string;
  keyFingerprint?: string;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

async function audit(
  client: DatabaseClient,
  input: {
    actorType: 'USER' | 'SYSTEM';
    actorId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    correlationId: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,correlation_id,before_data,after_data,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,
    [
      randomUUID(),
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.correlationId,
      JSON.stringify(sanitizeBusinessAuditData(input.before) ?? null),
      JSON.stringify(sanitizeBusinessAuditData(input.after) ?? null),
      JSON.stringify(sanitizeBusinessAuditData(input.metadata) ?? {}),
    ],
  );
}

@Injectable()
export class FulfillmentRepository {
  private readonly storage = new PrivateObjectStorage();

  private async orderRow(
    id: string,
    client: Pick<DatabaseClient, 'query'> = pool,
    forUpdate = false,
  ): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
      `SELECT id,commercial_number AS "commercialNumber",quote_id AS "quoteId",
              customer_id AS "customerId",status,version,quote_number_snapshot AS "quoteNumberSnapshot",
              customer_name_snapshot AS "customerNameSnapshot",total_amount_cents::text AS "totalAmountCents",
              deposit_policy_id AS "depositPolicyId",deposit_policy_version AS "depositPolicyVersion",
              deposit_rate_bps AS "depositRateBps",deposit_amount_cents::text AS "depositAmountCents",
              paid_amount_cents::text AS "paidAmountCents",
              current_artwork_version_id AS "currentArtworkVersionId",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM orders WHERE id=$1 ${forUpdate ? 'FOR UPDATE' : ''}`,
      [id],
    );
    if (!result.rows[0]) throw new DomainError('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
    return result.rows[0];
  }

  private async activeConnection(client: Pick<DatabaseClient, 'query'> = pool): Promise<SecretRow> {
    const result = await client.query<SecretRow>(
      `SELECT id,api_key_ciphertext AS "apiKeyCiphertext",api_key_nonce AS "apiKeyNonce",
              api_key_auth_tag AS "apiKeyAuthTag",webhook_token_ciphertext AS "webhookTokenCiphertext",
              webhook_token_nonce AS "webhookTokenNonce",webhook_token_auth_tag AS "webhookTokenAuthTag",
              webhook_public_url AS "webhookPublicUrl",key_fingerprint AS "keyFingerprint"
       FROM asaas_connections WHERE status='ACTIVE' AND environment='SANDBOX'`,
    );
    if (!result.rows[0]) {
      throw new DomainError(
        'ASAAS_NOT_CONFIGURED',
        'A conexão Sandbox do Asaas não está configurada.',
        422,
      );
    }
    return result.rows[0];
  }

  async putBillingDocument(
    actor: CurrentActor,
    customerId: string,
    cpfCnpj: string,
    correlationId: string,
  ) {
    const encrypted = encryptSecret(cpfCnpj, `customer:${customerId}:billing-document`);
    const hash = protectedHash(cpfCnpj, 'customer-billing-document');
    return transaction(async (client) => {
      const result = await client.query<{ id: string; version: number }>(
        `UPDATE customers SET billing_document_ciphertext=$2,billing_document_nonce=$3,
           billing_document_auth_tag=$4,billing_document_hash=$5,billing_document_last4=$6,
           version=version+1,updated_by=$7,updated_at=clock_timestamp()
         WHERE id=$1 RETURNING id,version`,
        [
          customerId,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.authTag,
          hash,
          cpfCnpj.slice(-4),
          actor.id,
        ],
      );
      if (!result.rows[0])
        throw new DomainError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'CUSTOMER_BILLING_DOCUMENT_UPDATED',
        resourceType: 'customer',
        resourceId: customerId,
        correlationId,
        after: { billingDocumentConfigured: true, billingDocumentLast4: cpfCnpj.slice(-4) },
      });
      return {
        id: customerId,
        version: result.rows[0].version,
        billingDocumentLast4: cpfCnpj.slice(-4),
      };
    });
  }

  async putDepositPolicy(
    actor: CurrentActor,
    input: { rateBps: number; minimumAmountCents: number; effectiveAt: string },
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: 'deposit-policy',
        key,
        payload: input,
      });
      if (locked.replayResourceId) return await this.getDepositPolicy(client);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('deposit-policy-version',0))",
      );
      const versionResult = await client.query<{ version: number }>(
        'SELECT COALESCE(max(version_number),0)+1 AS version FROM deposit_policies',
      );
      const id = randomUUID();
      await client.query(
        `UPDATE deposit_policies SET status='ARCHIVED',archived_at=clock_timestamp() WHERE status='ACTIVE'`,
      );
      await client.query(
        `INSERT INTO deposit_policies
           (id,version_number,status,rate_bps,minimum_amount_cents,effective_at,created_by)
         VALUES($1,$2,'ACTIVE',$3,$4,$5,$6)`,
        [
          id,
          versionResult.rows[0]!.version,
          input.rateBps,
          input.minimumAmountCents,
          input.effectiveAt,
          actor.id,
        ],
      );
      await recordIdempotency(client, {
        scope: 'deposit-policy',
        key,
        hash: locked.hash,
        resourceType: 'deposit_policy',
        resourceId: id,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'DEPOSIT_POLICY_ACTIVATED',
        resourceType: 'deposit_policy',
        resourceId: id,
        correlationId,
        after: { version: versionResult.rows[0]!.version, ...input },
      });
      return await this.getDepositPolicy(client);
    }, 'SERIALIZABLE');
  }

  async getDepositPolicy(client: Pick<DatabaseClient, 'query'> = pool) {
    const result = await client.query<{
      id: string;
      versionNumber: number;
      rateBps: number;
      minimumAmountCents: string;
      effectiveAt: Date;
    }>(
      `SELECT id,version_number AS "versionNumber",rate_bps AS "rateBps",
              minimum_amount_cents::text AS "minimumAmountCents",effective_at AS "effectiveAt"
       FROM deposit_policies WHERE status='ACTIVE'`,
    );
    if (!result.rows[0])
      throw new DomainError('DEPOSIT_POLICY_MISSING', 'Configure a política de sinal.', 422);
    return result.rows[0];
  }

  async convertQuote(actor: CurrentActor, quoteId: string, key: string, correlationId: string) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `quote:${quoteId}:convert`,
        key,
        payload: { quoteId },
      });
      if (locked.replayResourceId) return await this.getOrder(locked.replayResourceId, client);
      const quoteResult = await client.query<{
        id: string;
        commercialNumber: string;
        customerId: string;
        customerName: string;
        finalPriceCents: string;
        status: string;
      }>(
        `SELECT q.id,q.commercial_number AS "commercialNumber",q.customer_id AS "customerId",
                q.customer_display_name_snapshot AS "customerName",q.final_price_cents::text AS "finalPriceCents",q.status
         FROM quotes q WHERE q.id=$1 FOR UPDATE`,
        [quoteId],
      );
      const quote = quoteResult.rows[0];
      if (!quote) throw new DomainError('QUOTE_NOT_FOUND', 'Orçamento não encontrado.', 404);
      if (quote.status !== 'ISSUED') {
        throw new DomainError(
          'QUOTE_NOT_ISSUED',
          'Somente orçamento emitido pode virar pedido.',
          409,
        );
      }
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM orders WHERE quote_id=$1',
        [quoteId],
      );
      if (existing.rows[0]) {
        throw new DomainError(
          'QUOTE_ALREADY_CONVERTED',
          'O orçamento já foi convertido em pedido.',
          409,
        );
      }
      const policy = await this.getDepositPolicy(client);
      const total = Number(quote.finalPriceCents);
      const deposit = calculateDepositCents({
        totalCents: total,
        rateBps: policy.rateBps,
        minimumAmountCents: Number(policy.minimumAmountCents),
      });
      const numberResult = await client.query<{ number: string }>(
        `SELECT 'PED-' || to_char(clock_timestamp() AT TIME ZONE 'America/Manaus','YYYY') ||
                '-' || lpad(nextval('order_commercial_number_seq')::text,6,'0') AS number`,
      );
      const id = randomUUID();
      await client.query(
        `INSERT INTO orders
           (id,commercial_number,quote_id,customer_id,status,quote_number_snapshot,
            customer_name_snapshot,total_amount_cents,deposit_policy_id,deposit_policy_version,
            deposit_rate_bps,deposit_amount_cents,created_by)
         VALUES($1,$2,$3,$4,'PENDING_READINESS',$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id,
          numberResult.rows[0]!.number,
          quote.id,
          quote.customerId,
          quote.commercialNumber,
          quote.customerName,
          total,
          policy.id,
          policy.versionNumber,
          policy.rateBps,
          deposit,
          actor.id,
        ],
      );
      const items = await client.query<{
        id: string;
        displayOrder: number;
        productCode: string;
        productName: string;
        variantCode: string;
        variantName: string;
        techniqueCode: string;
        techniqueName: string;
        requestedQuantity: string;
        technicalSheetId: string;
        technicalSheetVersion: number;
      }>(
        `SELECT id,display_order AS "displayOrder",product_code_snapshot AS "productCode",
                product_name_snapshot AS "productName",variant_code_snapshot AS "variantCode",
                variant_name_snapshot AS "variantName",technique_code_snapshot AS "techniqueCode",
                technique_name_snapshot AS "techniqueName",requested_quantity::text AS "requestedQuantity",
                technical_sheet_id AS "technicalSheetId",technical_sheet_version AS "technicalSheetVersion"
         FROM quote_items WHERE quote_id=$1 ORDER BY display_order,id`,
        [quoteId],
      );
      for (const item of items.rows) {
        if (!item.technicalSheetId)
          throw new DomainError(
            'QUOTE_SNAPSHOT_INCOMPLETE',
            'Snapshot do orçamento incompleto.',
            409,
          );
        const orderItemId = randomUUID();
        await client.query(
          `INSERT INTO order_items
             (id,order_id,quote_item_id,display_order,product_code,product_name,variant_code,
              variant_name,technique_code,technique_name,requested_quantity,technical_sheet_id,
              technical_sheet_version)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            orderItemId,
            id,
            item.id,
            item.displayOrder,
            item.productCode,
            item.productName,
            item.variantCode,
            item.variantName,
            item.techniqueCode,
            item.techniqueName,
            item.requestedQuantity,
            item.technicalSheetId,
            item.technicalSheetVersion,
          ],
        );
        const materials = await client.query<{
          materialId: string;
          materialCode: string;
          materialName: string;
          unit: string;
          totalConsumption: string;
        }>(
          `SELECT material_id AS "materialId",material_code AS "materialCode",material_name AS "materialName",
                  unit,total_consumption::text AS "totalConsumption"
           FROM quote_material_snapshots WHERE quote_item_id=$1`,
          [item.id],
        );
        for (const material of materials.rows) {
          await client.query(
            `INSERT INTO order_material_requirements
               (id,order_id,order_item_id,material_id,material_code,material_name,unit,required_quantity)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              id,
              orderItemId,
              material.materialId,
              material.materialCode,
              material.materialName,
              material.unit,
              material.totalConsumption,
            ],
          );
        }
      }
      await this.recordState(
        client,
        id,
        null,
        'PENDING_READINESS',
        'Conversão explícita do orçamento.',
        'USER',
        actor.id,
        correlationId,
      );
      await recordIdempotency(client, {
        scope: `quote:${quoteId}:convert`,
        key,
        hash: locked.hash,
        resourceType: 'order',
        resourceId: id,
        status: 201,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'QUOTE_CONVERTED_TO_ORDER',
        resourceType: 'order',
        resourceId: id,
        correlationId,
        after: {
          commercialNumber: numberResult.rows[0]!.number,
          quoteId,
          depositAmountCents: deposit,
        },
      });
      return await this.getOrder(id, client);
    }, 'SERIALIZABLE');
  }

  private async recordState(
    client: DatabaseClient,
    orderId: string,
    from: OrderStatus | null,
    to: OrderStatus,
    reason: string,
    actorType: 'USER' | 'SYSTEM',
    actorId: string | null,
    correlationId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO order_state_history
         (id,order_id,from_status,to_status,reason,actor_type,actor_id,correlation_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), orderId, from, to, reason, actorType, actorId, correlationId],
    );
  }

  async listOrders(input: { status?: string; cursor?: string }): Promise<Page<unknown>> {
    const cursor = decodeCommercialCursor(input.cursor);
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.status) {
      values.push(input.status);
      where.push(`status=$${values.length}`);
    }
    if (cursor) {
      values.push(cursor.value, cursor.id);
      where.push(`(created_at,id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    }
    values.push(21);
    const result = await pool.query(
      `SELECT id,commercial_number AS "commercialNumber",quote_number_snapshot AS "quoteNumber",
              customer_name_snapshot AS "customerName",status,total_amount_cents::text AS "totalAmountCents",
              deposit_amount_cents::text AS "depositAmountCents",paid_amount_cents::text AS "paidAmountCents",
              created_at AS "createdAt"
       FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC,id DESC LIMIT $${values.length}`,
      values,
    );
    const rows = result.rows as Array<{ id: string; createdAt: Date }>;
    const items = rows.slice(0, 20);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 20 && last
          ? encodeCommercialCursor({ value: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async getOrder(id: string, client: Pick<DatabaseClient, 'query'> = pool) {
    const order = await this.orderRow(id, client);
    const items = await client.query(
      `SELECT id,product_code AS "productCode",product_name AS "productName",
        variant_code AS "variantCode",variant_name AS "variantName",technique_code AS "techniqueCode",
        technique_name AS "techniqueName",requested_quantity::text AS "requestedQuantity",
        technical_sheet_version AS "technicalSheetVersion" FROM order_items WHERE order_id=$1 ORDER BY display_order,id`,
      [id],
    );
    const materials = await client.query(
      `SELECT material_id AS "materialId",material_code AS "materialCode",material_name AS "materialName",
        unit,sum(required_quantity)::text AS "requiredQuantity" FROM order_material_requirements
        WHERE order_id=$1 GROUP BY material_id,material_code,material_name,unit ORDER BY material_name`,
      [id],
    );
    const charges = await client.query(
      `SELECT id,status,billing_type AS "billingType",amount_cents::text AS "amountCents",
        due_date::text AS "dueDate",invoice_url AS "invoiceUrl",external_charge_id AS "externalChargeId",
        created_at AS "createdAt" FROM payment_charges WHERE order_id=$1 ORDER BY created_at DESC`,
      [id],
    );
    const artworks = await client.query<ArtworkDetailRow>(
      `SELECT a.id,a.version_number AS "versionNumber",a.status,a.customer_confirmation_reference AS "customerConfirmationReference",
        a.customer_confirmed_at AS "customerConfirmedAt",f.original_name AS "originalName",f.mime_type AS "mimeType",
        f.size_bytes::text AS "sizeBytes",f.sha256,a.created_at AS "createdAt"
        FROM artwork_versions a JOIN object_files f ON f.id=a.file_id WHERE a.order_id=$1 ORDER BY a.version_number DESC`,
      [id],
    );
    const reservations = await client.query<ReservationDetailRow>(
      `SELECT material_id AS "materialId",required_quantity::text AS "requiredQuantity",
        reserved_quantity::text AS "reservedQuantity",status,exception_confirmed AS "exceptionConfirmed",
        exception_reason AS "exceptionReason" FROM inventory_reservations WHERE order_id=$1`,
      [id],
    );
    const alerts = await client.query<AlertDetailRow>(
      `SELECT material_id AS "materialId",required_quantity::text AS "requiredQuantity",
        available_quantity::text AS "availableQuantity",status,reason,created_at AS "createdAt"
        FROM inventory_reservation_alerts WHERE order_id=$1 ORDER BY created_at DESC`,
      [id],
    );
    const history = await client.query(
      `SELECT from_status AS "fromStatus",to_status AS "toStatus",reason,actor_type AS "actorType",
        created_at AS "createdAt" FROM order_state_history WHERE order_id=$1 ORDER BY created_at,id`,
      [id],
    );
    const decisions = await client.query<FinancialDecisionDetailRow>(
      `SELECT type,reason,amount_cents::text AS "amountCents",created_at AS "createdAt"
        FROM financial_decisions WHERE order_id=$1 ORDER BY created_at DESC`,
      [id],
    );
    const artworkApproved = artworks.rows.some((row) => row.status === 'APPROVED');
    const financialExceptionApproved = decisions.rows.some(
      (row) => row.type === 'SIGNAL_EXCEPTION_APPROVED',
    );
    const hasOpenAlerts = alerts.rows.some((row) => row.status === 'OPEN');
    const readiness = evaluateOrderReadiness({
      artworkApproved,
      paidAmountCents: Number(order.paidAmountCents),
      depositAmountCents: Number(order.depositAmountCents),
      financialExceptionApproved,
      stockAvailable: !hasOpenAlerts,
      stockExceptionApproved: reservations.rows.some((row) => row.exceptionConfirmed),
    });
    return {
      ...order,
      items: items.rows,
      materials: materials.rows,
      charges: charges.rows,
      artworks: artworks.rows,
      reservations: reservations.rows,
      alerts: alerts.rows,
      history: history.rows,
      decisions: decisions.rows,
      readiness,
    };
  }

  async configureAsaas(
    actor: CurrentActor,
    input: {
      environment: 'SANDBOX';
      apiKey: string;
      webhookAuthToken: string;
      webhookPublicUrl: string;
    },
    key: string,
    correlationId: string,
  ): Promise<AsaasConfigurationView> {
    const id = randomUUID();
    const apiKey = encryptSecret(input.apiKey, `asaas:${id}:api-key`);
    const webhook = encryptSecret(input.webhookAuthToken, `asaas:${id}:webhook-token`);
    const payload = {
      environment: input.environment,
      webhookPublicUrl: input.webhookPublicUrl,
      keyFingerprint: shortFingerprint(input.apiKey),
      webhookTokenFingerprint: shortFingerprint(input.webhookAuthToken),
    };
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, { scope: 'asaas-connection', key, payload });
      if (locked.replayResourceId) return await this.getAsaasConfiguration(client);
      await client.query(
        `UPDATE asaas_connections SET status='INACTIVE',updated_by=$1,updated_at=clock_timestamp() WHERE status='ACTIVE'`,
        [actor.id],
      );
      await client.query(
        `INSERT INTO asaas_connections
           (id,environment,status,api_key_ciphertext,api_key_nonce,api_key_auth_tag,
            webhook_token_ciphertext,webhook_token_nonce,webhook_token_auth_tag,
            webhook_public_url,key_fingerprint,created_by,updated_by)
         VALUES($1,'SANDBOX','ACTIVE',$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [
          id,
          apiKey.ciphertext,
          apiKey.nonce,
          apiKey.authTag,
          webhook.ciphertext,
          webhook.nonce,
          webhook.authTag,
          input.webhookPublicUrl,
          payload.keyFingerprint,
          actor.id,
        ],
      );
      await recordIdempotency(client, {
        scope: 'asaas-connection',
        key,
        hash: locked.hash,
        resourceType: 'asaas_connection',
        resourceId: id,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'ASAAS_SANDBOX_CONFIGURED',
        resourceType: 'asaas_connection',
        resourceId: id,
        correlationId,
        after: payload,
      });
      return await this.getAsaasConfiguration(client);
    }, 'SERIALIZABLE');
  }

  async getAsaasConfiguration(
    client: Pick<DatabaseClient, 'query'> = pool,
  ): Promise<AsaasConfigurationView> {
    const result = await client.query<AsaasConfigurationView>(
      `SELECT id,environment,status,webhook_public_url AS "webhookPublicUrl",
              key_fingerprint AS "keyFingerprint",version,created_at AS "createdAt",updated_at AS "updatedAt"
       FROM asaas_connections WHERE status='ACTIVE'`,
    );
    return result.rows[0] ?? { status: 'NOT_CONFIGURED', environment: 'SANDBOX' };
  }

  async createCharge(
    actor: CurrentActor,
    orderId: string,
    input: { billingType: 'PIX' | 'BOLETO' | 'UNDEFINED'; dueDate: string },
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `order:${orderId}:charge`,
        key,
        payload: input,
      });
      if (locked.replayResourceId) return await this.getOrder(orderId, client);
      const order = await this.orderRow(orderId, client, true);
      if (order.status === 'CANCELLED')
        throw new DomainError('ORDER_CANCELLED', 'Pedido cancelado.', 409);
      await this.activeConnection(client);
      const customer = await client.query<{ configured: boolean }>(
        `SELECT billing_document_ciphertext IS NOT NULL AS configured FROM customers WHERE id=$1`,
        [order.customerId],
      );
      if (!customer.rows[0]?.configured) {
        throw new DomainError(
          'CUSTOMER_BILLING_DOCUMENT_MISSING',
          'Informe CPF ou CNPJ do cliente para cobrar.',
          422,
        );
      }
      const id = randomUUID();
      const reference = `NORTH-${order.commercialNumber}-${id.slice(0, 8)}`;
      await client.query(
        `INSERT INTO payment_charges
           (id,order_id,provider,environment,status,billing_type,amount_cents,due_date,
            external_reference,created_by)
         VALUES($1,$2,'ASAAS','SANDBOX','PENDING_CREATION',$3,$4,$5,$6,$7)`,
        [
          id,
          orderId,
          input.billingType,
          order.depositAmountCents,
          input.dueDate,
          reference,
          actor.id,
        ],
      );
      await client.query(
        `INSERT INTO integration_outbox
           (id,aggregate_type,aggregate_id,event_type,payload,status)
         VALUES($1,'payment_charge',$2,'ASAAS_CHARGE_CREATE',$3::jsonb,'PENDING')`,
        [randomUUID(), id, JSON.stringify({ chargeId: id })],
      );
      await recordIdempotency(client, {
        scope: `order:${orderId}:charge`,
        key,
        hash: locked.hash,
        resourceType: 'payment_charge',
        resourceId: id,
        status: 202,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'PAYMENT_CHARGE_REQUESTED',
        resourceType: 'payment_charge',
        resourceId: id,
        correlationId,
        after: {
          orderId,
          billingType: input.billingType,
          amountCents: order.depositAmountCents,
          dueDate: input.dueDate,
        },
      });
      return await this.getOrder(orderId, client);
    }, 'SERIALIZABLE');
  }

  async receiveWebhook(
    token: string | undefined,
    body: { id: string; event: string; payment: { id: string; value?: number } },
  ) {
    const connection = await this.activeConnection();
    const expected = decryptSecret(
      {
        ciphertext: connection.webhookTokenCiphertext,
        nonce: connection.webhookTokenNonce,
        authTag: connection.webhookTokenAuthTag,
      },
      `asaas:${connection.id}:webhook-token`,
    );
    if (!token || !safeTokenEquals(createHash('sha256').update(expected).digest('hex'), token)) {
      throw new DomainError('INVALID_WEBHOOK_TOKEN', 'Webhook não autorizado.', 401);
    }
    const safePayload = {
      id: body.id,
      event: body.event,
      payment: { id: body.payment.id, value: body.payment.value },
    };
    const result = await pool.query(
      `INSERT INTO asaas_webhook_inbox
         (id,external_event_id,event_type,external_charge_id,payload,status)
       VALUES($1,$2,$3,$4,$5::jsonb,'RECEIVED') ON CONFLICT(external_event_id) DO NOTHING`,
      [randomUUID(), body.id, body.event, body.payment.id, JSON.stringify(safePayload)],
    );
    return { received: true, duplicate: result.rowCount === 0 };
  }

  async uploadArtwork(
    actor: CurrentActor,
    orderId: string,
    input: { originalName: string; mimeType: string; contentBase64: string },
    key: string,
    correlationId: string,
  ) {
    const content = Buffer.from(input.contentBase64, 'base64');
    if (content.toString('base64').replace(/=+$/, '') !== input.contentBase64.replace(/=+$/, '')) {
      throw new DomainError('INVALID_BASE64', 'Conteúdo da arte inválido.', 400);
    }
    validateArtworkContent(input.mimeType, content);
    const fileId = randomUUID();
    const storageKey = `artworks/${orderId}/${fileId}`;
    await this.storage.put(storageKey, content);
    try {
      return await transaction(async (client) => {
        const locked = await lockIdempotency(client, {
          scope: `order:${orderId}:artwork`,
          key,
          payload: {
            originalName: input.originalName,
            mimeType: input.mimeType,
            sha256: createHash('sha256').update(content).digest('hex'),
          },
        });
        if (locked.replayResourceId) return await this.getOrder(orderId, client);
        const order = await this.orderRow(orderId, client, true);
        if (order.status === 'CANCELLED')
          throw new DomainError('ORDER_CANCELLED', 'Pedido cancelado.', 409);
        const next = await client.query<{ version: number }>(
          `SELECT COALESCE(max(version_number),0)+1 AS version FROM artwork_versions WHERE order_id=$1`,
          [orderId],
        );
        await client.query(
          `UPDATE artwork_versions SET status='SUPERSEDED' WHERE order_id=$1 AND status<>'SUPERSEDED'`,
          [orderId],
        );
        await client.query(
          `INSERT INTO object_files(id,storage_key,original_name,mime_type,size_bytes,sha256,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            fileId,
            storageKey,
            input.originalName,
            input.mimeType,
            content.length,
            createHash('sha256').update(content).digest('hex'),
            actor.id,
          ],
        );
        const artworkId = randomUUID();
        await client.query(
          `INSERT INTO artwork_versions(id,order_id,version_number,file_id,status,created_by)
           VALUES($1,$2,$3,$4,'PENDING_CUSTOMER',$5)`,
          [artworkId, orderId, next.rows[0]!.version, fileId, actor.id],
        );
        await client.query(
          `UPDATE orders SET current_artwork_version_id=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1`,
          [orderId, artworkId],
        );
        await recordIdempotency(client, {
          scope: `order:${orderId}:artwork`,
          key,
          hash: locked.hash,
          resourceType: 'artwork_version',
          resourceId: artworkId,
          status: 201,
        });
        await audit(client, {
          actorType: 'USER',
          actorId: actor.id,
          action: 'ARTWORK_VERSION_CREATED',
          resourceType: 'artwork_version',
          resourceId: artworkId,
          correlationId,
          after: {
            orderId,
            version: next.rows[0]!.version,
            mimeType: input.mimeType,
            sizeBytes: content.length,
            sha256: createHash('sha256').update(content).digest('hex'),
          },
        });
        return await this.getOrder(orderId, client);
      }, 'SERIALIZABLE');
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async readArtwork(actor: CurrentActor, orderId: string, artworkId: string) {
    void actor;
    const result = await pool.query<{ storageKey: string; originalName: string; mimeType: string }>(
      `SELECT f.storage_key AS "storageKey",f.original_name AS "originalName",f.mime_type AS "mimeType"
       FROM artwork_versions a JOIN object_files f ON f.id=a.file_id
       WHERE a.id=$1 AND a.order_id=$2`,
      [artworkId, orderId],
    );
    const file = result.rows[0];
    if (!file) throw new DomainError('ARTWORK_NOT_FOUND', 'Arte não encontrada.', 404);
    return { ...file, content: await this.storage.get(file.storageKey) };
  }

  async confirmArtwork(
    actor: CurrentActor,
    orderId: string,
    artworkId: string,
    reference: string,
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `artwork:${artworkId}:confirm`,
        key,
        payload: { reference },
      });
      if (locked.replayResourceId) return await this.getOrder(orderId, client);
      const updated = await client.query(
        `UPDATE artwork_versions SET status='CUSTOMER_CONFIRMED',customer_confirmation_reference=$3,
           customer_confirmed_at=clock_timestamp(),customer_confirmed_by=$4
         WHERE id=$1 AND order_id=$2 AND status='PENDING_CUSTOMER'`,
        [artworkId, orderId, reference, actor.id],
      );
      if (updated.rowCount !== 1)
        throw new DomainError(
          'ARTWORK_CONFIRMATION_CONFLICT',
          'A arte não está aguardando confirmação.',
          409,
        );
      await recordIdempotency(client, {
        scope: `artwork:${artworkId}:confirm`,
        key,
        hash: locked.hash,
        resourceType: 'artwork_version',
        resourceId: artworkId,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'CUSTOMER_ARTWORK_CONFIRMATION_RECORDED',
        resourceType: 'artwork_version',
        resourceId: artworkId,
        correlationId,
        after: { orderId, customerConfirmationRecorded: true },
      });
      return await this.getOrder(orderId, client);
    });
  }

  async approveArtwork(
    actor: CurrentActor,
    orderId: string,
    artworkId: string,
    reference: string,
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `artwork:${artworkId}:approve`,
        key,
        payload: { reference },
      });
      if (locked.replayResourceId) return await this.getOrder(orderId, client);
      const updated = await client.query(
        `UPDATE artwork_versions SET status='APPROVED'
         WHERE id=$1 AND order_id=$2 AND status='CUSTOMER_CONFIRMED'`,
        [artworkId, orderId],
      );
      if (updated.rowCount !== 1)
        throw new DomainError(
          'ARTWORK_APPROVAL_CONFLICT',
          'A confirmação do cliente deve preceder a aprovação.',
          409,
        );
      await client.query(
        `INSERT INTO artwork_approvals(id,artwork_version_id,customer_confirmation_reference,approved_by)
         VALUES($1,$2,$3,$4)`,
        [randomUUID(), artworkId, reference, actor.id],
      );
      await recordIdempotency(client, {
        scope: `artwork:${artworkId}:approve`,
        key,
        hash: locked.hash,
        resourceType: 'artwork_version',
        resourceId: artworkId,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'ARTWORK_APPROVED',
        resourceType: 'artwork_version',
        resourceId: artworkId,
        correlationId,
        after: { orderId, customerConfirmationRecorded: true },
      });
      await this.evaluateAndReserve(client, actor, orderId, false, undefined, correlationId);
      return await this.getOrder(orderId, client);
    }, 'SERIALIZABLE');
  }

  async approveFinancialException(
    actor: CurrentActor,
    orderId: string,
    reason: string,
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `order:${orderId}:financial-exception`,
        key,
        payload: { reason },
      });
      if (locked.replayResourceId) return await this.getOrder(orderId, client);
      const order = await this.orderRow(orderId, client, true);
      const id = randomUUID();
      await client.query(
        `INSERT INTO financial_decisions(id,order_id,type,reason,amount_cents,created_by)
         VALUES($1,$2,'SIGNAL_EXCEPTION_APPROVED',$3,$4,$5)`,
        [id, orderId, reason, order.depositAmountCents, actor.id],
      );
      await recordIdempotency(client, {
        scope: `order:${orderId}:financial-exception`,
        key,
        hash: locked.hash,
        resourceType: 'financial_decision',
        resourceId: id,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'SIGNAL_EXCEPTION_APPROVED',
        resourceType: 'order',
        resourceId: orderId,
        correlationId,
        after: { reasonProvided: true },
      });
      await this.evaluateAndReserve(client, actor, orderId, false, undefined, correlationId);
      return await this.getOrder(orderId, client);
    }, 'SERIALIZABLE');
  }

  async evaluateReadiness(
    actor: CurrentActor,
    orderId: string,
    input: { confirmStockException: boolean; stockExceptionReason?: string },
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `order:${orderId}:readiness`,
        key,
        payload: input,
      });
      if (locked.replayResourceId) return await this.getOrder(orderId, client);
      await this.evaluateAndReserve(
        client,
        actor,
        orderId,
        input.confirmStockException,
        input.stockExceptionReason,
        correlationId,
      );
      await recordIdempotency(client, {
        scope: `order:${orderId}:readiness`,
        key,
        hash: locked.hash,
        resourceType: 'order',
        resourceId: orderId,
      });
      return await this.getOrder(orderId, client);
    }, 'SERIALIZABLE');
  }

  private async evaluateAndReserve(
    client: DatabaseClient,
    actor: Pick<CurrentActor, 'id' | 'role'> | null,
    orderId: string,
    confirmStockException: boolean,
    stockExceptionReason: string | undefined,
    correlationId: string,
  ): Promise<void> {
    const order = await this.orderRow(orderId, client, true);
    if (order.status === 'CANCELLED' || order.status === 'READY_FOR_PRODUCTION') return;
    const art = await client.query<{ approved: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM artwork_versions WHERE id=$1 AND order_id=$2 AND status='APPROVED') AS approved`,
      [order.currentArtworkVersionId, orderId],
    );
    const financial = await client.query<{ approved: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM financial_decisions WHERE order_id=$1 AND type='SIGNAL_EXCEPTION_APPROVED' AND revoked_at IS NULL) AS approved`,
      [orderId],
    );
    await client.query(
      `SELECT material_id FROM inventory_balances WHERE material_id IN
         (SELECT material_id FROM order_material_requirements WHERE order_id=$1)
       ORDER BY material_id FOR UPDATE`,
      [orderId],
    );
    const requirements = await client.query<{
      materialId: string;
      requiredQuantity: string;
      physicalQuantity: string;
      reservedQuantity: string;
    }>(
      `SELECT r.material_id AS "materialId",sum(r.required_quantity)::text AS "requiredQuantity",
              b.physical_quantity::text AS "physicalQuantity",b.reserved_quantity::text AS "reservedQuantity"
       FROM order_material_requirements r JOIN inventory_balances b ON b.material_id=r.material_id
       WHERE r.order_id=$1 GROUP BY r.material_id,b.physical_quantity,b.reserved_quantity
       ORDER BY r.material_id`,
      [orderId],
    );
    const shortages = requirements.rows.filter(
      (row) =>
        quantityToScaled(row.physicalQuantity) - quantityToScaled(row.reservedQuantity) <
        quantityToScaled(row.requiredQuantity),
    );
    if (confirmStockException && !actor)
      throw new DomainError('FORBIDDEN', 'Exceção exige gestor.', 403);
    if (confirmStockException && actor)
      assertStockException({
        role: actor.role,
        hasShortage: shortages.length > 0,
        confirmException: true,
        reason: stockExceptionReason,
      });
    await client.query(
      `UPDATE inventory_reservation_alerts SET status='RESOLVED',resolved_at=clock_timestamp(),resolved_by=$2
      WHERE order_id=$1 AND status='OPEN'`,
      [orderId, actor?.id ?? null],
    );
    for (const shortage of shortages) {
      await client.query(
        `INSERT INTO inventory_reservation_alerts
           (id,order_id,material_id,required_quantity,available_quantity,status,reason,resolved_by,resolved_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          orderId,
          shortage.materialId,
          shortage.requiredQuantity,
          scaledToQuantity(
            quantityToScaled(shortage.physicalQuantity) -
              quantityToScaled(shortage.reservedQuantity),
          ),
          confirmStockException ? 'OVERRIDDEN' : 'OPEN',
          confirmStockException ? stockExceptionReason : null,
          confirmStockException ? actor?.id : null,
          confirmStockException ? new Date() : null,
        ],
      );
    }
    const readiness = evaluateOrderReadiness({
      artworkApproved: art.rows[0]?.approved ?? false,
      paidAmountCents: Number(order.paidAmountCents),
      depositAmountCents: Number(order.depositAmountCents),
      financialExceptionApproved: financial.rows[0]?.approved ?? false,
      stockAvailable: shortages.length === 0,
      stockExceptionApproved: confirmStockException,
    });
    if (!readiness.ready) {
      await client.query(
        `UPDATE orders SET readiness_evaluated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
        [orderId],
      );
      return;
    }
    const existing = await client.query<{ count: string }>(
      `SELECT count(id)::text AS count FROM inventory_reservations WHERE order_id=$1 AND status='ACTIVE'`,
      [orderId],
    );
    if (Number(existing.rows[0]!.count) === 0) {
      for (const row of requirements.rows) {
        const resultingReserved = scaledToQuantity(
          quantityToScaled(row.reservedQuantity) + quantityToScaled(row.requiredQuantity),
        );
        await client.query(
          `INSERT INTO inventory_reservations
             (id,order_id,material_id,required_quantity,reserved_quantity,status,exception_confirmed,exception_reason,created_by)
           VALUES($1,$2,$3,$4,$4,'ACTIVE',$5,$6,$7)`,
          [
            randomUUID(),
            orderId,
            row.materialId,
            row.requiredQuantity,
            confirmStockException,
            confirmStockException ? stockExceptionReason : null,
            actor?.id ?? (await this.systemActor(client)),
          ],
        );
        await client.query(
          `UPDATE inventory_balances SET reserved_quantity=$2,version=version+1,updated_at=clock_timestamp()
           WHERE material_id=$1`,
          [row.materialId, resultingReserved],
        );
        await client.query(
          `INSERT INTO inventory_movements
             (id,material_id,type,quantity_delta,reserved_quantity_delta,reason,source_type,source_id,
              idempotency_key,request_hash,correlation_id,negative_stock_confirmed,resulting_physical,
              resulting_reserved,created_by)
           VALUES($1,$2,'RESERVATION',0,$3,$4,'ORDER',$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            randomUUID(),
            row.materialId,
            row.requiredQuantity,
            confirmStockException
              ? stockExceptionReason
              : 'Reserva automática por prontidão do pedido.',
            orderId,
            `reservation:${orderId}:${row.materialId}`,
            commercialRequestHash({
              orderId,
              materialId: row.materialId,
              quantity: row.requiredQuantity,
            }),
            correlationId,
            confirmStockException,
            row.physicalQuantity,
            resultingReserved,
            actor?.id ?? (await this.systemActor(client)),
          ],
        );
      }
    }
    assertOrderTransition(order.status, 'READY_FOR_PRODUCTION');
    await client.query(
      `UPDATE orders SET status='READY_FOR_PRODUCTION',readiness_evaluated_at=clock_timestamp(),
         reserved_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE id=$1`,
      [orderId],
    );
    await this.recordState(
      client,
      orderId,
      order.status,
      'READY_FOR_PRODUCTION',
      'Arte, sinal e materiais validados.',
      actor ? 'USER' : 'SYSTEM',
      actor?.id ?? null,
      correlationId,
    );
    await audit(client, {
      actorType: actor ? 'USER' : 'SYSTEM',
      actorId: actor?.id,
      action: 'ORDER_READY_FOR_PRODUCTION',
      resourceType: 'order',
      resourceId: orderId,
      correlationId,
      after: {
        reservationsCreated: requirements.rows.length,
        stockException: confirmStockException,
      },
    });
  }

  private async systemActor(client: Pick<DatabaseClient, 'query'>): Promise<string> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role='MANAGER' AND status='ACTIVE' ORDER BY created_at,id LIMIT 1`,
    );
    if (!result.rows[0])
      throw new DomainError(
        'SYSTEM_ACTOR_MISSING',
        'Não há gestor ativo para registrar o movimento.',
        409,
      );
    return result.rows[0].id;
  }

  async cancelOrder(
    actor: CurrentActor,
    orderId: string,
    reason: string,
    key: string,
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const locked = await lockIdempotency(client, {
        scope: `order:${orderId}:cancel`,
        key,
        payload: { reason },
      });
      if (locked.replayResourceId) return await this.getOrder(orderId, client);
      const order = await this.orderRow(orderId, client, true);
      if (order.status === 'CANCELLED')
        throw new DomainError('ORDER_ALREADY_CANCELLED', 'Pedido já cancelado.', 409);
      assertOrderTransition(order.status, 'CANCELLED');
      const reservations = await client.query<{
        id: string;
        materialId: string;
        reservedQuantity: string;
        physicalQuantity: string;
        currentReserved: string;
      }>(
        `SELECT r.id,r.material_id AS "materialId",r.reserved_quantity::text AS "reservedQuantity",
                b.physical_quantity::text AS "physicalQuantity",b.reserved_quantity::text AS "currentReserved"
         FROM inventory_reservations r JOIN inventory_balances b ON b.material_id=r.material_id
         WHERE r.order_id=$1 AND r.status='ACTIVE' ORDER BY r.material_id FOR UPDATE OF b`,
        [orderId],
      );
      for (const reservation of reservations.rows) {
        const resulting = scaledToQuantity(
          quantityToScaled(reservation.currentReserved) -
            quantityToScaled(reservation.reservedQuantity),
        );
        await client.query(
          `UPDATE inventory_balances SET reserved_quantity=$2,version=version+1,updated_at=clock_timestamp() WHERE material_id=$1`,
          [reservation.materialId, resulting],
        );
        await client.query(
          `UPDATE inventory_reservations SET status='RELEASED',released_by=$2,released_at=clock_timestamp() WHERE id=$1`,
          [reservation.id, actor.id],
        );
        await client.query(
          `INSERT INTO inventory_movements
             (id,material_id,type,quantity_delta,reserved_quantity_delta,reason,source_type,source_id,
              idempotency_key,request_hash,correlation_id,negative_stock_confirmed,resulting_physical,
              resulting_reserved,created_by)
           VALUES($1,$2,'RELEASE',0,$3,$4,'ORDER',$5,$6,$7,$8,false,$9,$10,$11)`,
          [
            randomUUID(),
            reservation.materialId,
            `-${reservation.reservedQuantity}`,
            reason,
            orderId,
            `release:${orderId}:${reservation.materialId}`,
            commercialRequestHash({ orderId, materialId: reservation.materialId, reason }),
            correlationId,
            reservation.physicalQuantity,
            resulting,
            actor.id,
          ],
        );
      }
      if (Number(order.paidAmountCents) > 0) {
        await client.query(
          `INSERT INTO financial_decisions(id,order_id,type,reason,amount_cents,created_by)
           VALUES($1,$2,'PAYMENT_REVIEW_REQUIRED',$3,$4,$5)`,
          [
            randomUUID(),
            orderId,
            'Pedido cancelado com valor confirmado; revisar estorno manualmente.',
            order.paidAmountCents,
            actor.id,
          ],
        );
      }
      await client.query(
        `UPDATE orders SET status='CANCELLED',cancelled_by=$2,cancellation_reason=$3,
           cancelled_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE id=$1`,
        [orderId, actor.id, reason],
      );
      await this.recordState(
        client,
        orderId,
        order.status,
        'CANCELLED',
        reason,
        'USER',
        actor.id,
        correlationId,
      );
      await recordIdempotency(client, {
        scope: `order:${orderId}:cancel`,
        key,
        hash: locked.hash,
        resourceType: 'order',
        resourceId: orderId,
      });
      await audit(client, {
        actorType: 'USER',
        actorId: actor.id,
        action: 'ORDER_CANCELLED',
        resourceType: 'order',
        resourceId: orderId,
        correlationId,
        after: {
          reasonProvided: true,
          releasedReservations: reservations.rows.length,
          financialReviewRequired: Number(order.paidAmountCents) > 0,
        },
      });
      return await this.getOrder(orderId, client);
    }, 'SERIALIZABLE');
  }

  async processOneOutbox(workerId: string): Promise<boolean> {
    const claimed = await transaction(async (client) => {
      const result = await client.query<{ id: string; aggregateId: string; eventType: string }>(
        `SELECT id,aggregate_id AS "aggregateId",event_type AS "eventType" FROM integration_outbox
         WHERE status IN ('PENDING','FAILED') AND available_at<=clock_timestamp()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `UPDATE integration_outbox SET status='PROCESSING',attempts=attempts+1,
        locked_at=clock_timestamp(),locked_by=$2 WHERE id=$1`,
        [row.id, workerId],
      );
      return row;
    });
    if (!claimed) return false;
    try {
      if (claimed.eventType === 'ASAAS_CHARGE_CREATE')
        await this.dispatchCharge(claimed.aggregateId);
      await pool.query(
        `UPDATE integration_outbox SET status='PROCESSED',processed_at=clock_timestamp(),last_error_code=NULL WHERE id=$1`,
        [claimed.id],
      );
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'UNEXPECTED_PROVIDER_ERROR';
      await pool.query(
        `UPDATE integration_outbox SET status='FAILED',available_at=clock_timestamp()+
        make_interval(secs=>LEAST(300,power(2,LEAST(attempts,8))::int)),last_error_code=$2 WHERE id=$1`,
        [claimed.id, code],
      );
    }
    return true;
  }

  private async dispatchCharge(chargeId: string): Promise<void> {
    const connection = await this.activeConnection();
    const apiKey = decryptSecret(
      {
        ciphertext: connection.apiKeyCiphertext,
        nonce: connection.apiKeyNonce,
        authTag: connection.apiKeyAuthTag,
      },
      `asaas:${connection.id}:api-key`,
    );
    const data = await pool.query<{
      orderId: string;
      customerId: string;
      customerName: string;
      documentCiphertext: Buffer;
      documentNonce: Buffer;
      documentAuthTag: Buffer;
      documentHash: string;
      externalCustomerId: string | null;
      billingType: 'PIX' | 'BOLETO' | 'UNDEFINED';
      amountCents: string;
      dueDate: string;
      externalReference: string;
    }>(
      `SELECT c.order_id AS "orderId",o.customer_id AS "customerId",o.customer_name_snapshot AS "customerName",
              u.billing_document_ciphertext AS "documentCiphertext",u.billing_document_nonce AS "documentNonce",
              u.billing_document_auth_tag AS "documentAuthTag",u.billing_document_hash AS "documentHash",
              b.external_customer_id AS "externalCustomerId",c.billing_type AS "billingType",
              c.amount_cents::text AS "amountCents",c.due_date::text AS "dueDate",c.external_reference AS "externalReference"
       FROM payment_charges c JOIN orders o ON o.id=c.order_id JOIN customers u ON u.id=o.customer_id
       LEFT JOIN asaas_customer_bindings b ON b.customer_id=o.customer_id AND b.environment='SANDBOX'
       WHERE c.id=$1`,
      [chargeId],
    );
    const charge = data.rows[0];
    if (!charge) throw new Error('CHARGE_NOT_FOUND');
    const gateway = new AsaasGateway(apiKey);
    let externalCustomerId = charge.externalCustomerId;
    if (!externalCustomerId) {
      const document = decryptSecret(
        {
          ciphertext: charge.documentCiphertext,
          nonce: charge.documentNonce,
          authTag: charge.documentAuthTag,
        },
        `customer:${charge.customerId}:billing-document`,
      );
      const external = await gateway.createCustomer({
        name: charge.customerName,
        cpfCnpj: document,
        externalReference: charge.customerId,
        notificationDisabled: true,
      });
      externalCustomerId = external.id;
      await pool.query(
        `INSERT INTO asaas_customer_bindings(id,customer_id,environment,external_customer_id,document_hash)
         VALUES($1,$2,'SANDBOX',$3,$4) ON CONFLICT(customer_id,environment) DO NOTHING`,
        [randomUUID(), charge.customerId, external.id, charge.documentHash],
      );
    }
    const external = await gateway.createCharge({
      customer: externalCustomerId,
      billingType: charge.billingType,
      value: Number(charge.amountCents) / 100,
      dueDate: charge.dueDate,
      externalReference: charge.externalReference,
    });
    await transaction(async (client) => {
      await client.query(
        `UPDATE payment_charges SET external_charge_id=$2,status='CREATED',invoice_url=$3,
           version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND status='PENDING_CREATION'`,
        [chargeId, external.id, external.invoiceUrl ?? external.bankSlipUrl ?? null],
      );
      await audit(client, {
        actorType: 'SYSTEM',
        action: 'ASAAS_CHARGE_CREATED',
        resourceType: 'payment_charge',
        resourceId: chargeId,
        correlationId: randomUUID(),
        after: {
          provider: 'ASAAS',
          environment: 'SANDBOX',
          externalChargeId: external.id,
          status: external.status,
        },
      });
    });
  }

  async processOneWebhook(workerId: string): Promise<boolean> {
    void workerId;
    const claimed = await transaction(async (client) => {
      const result = await client.query<{
        id: string;
        eventType: string;
        externalChargeId: string;
        payload: { payment?: { value?: number } };
      }>(
        `SELECT id,event_type AS "eventType",external_charge_id AS "externalChargeId",payload
         FROM asaas_webhook_inbox WHERE status IN ('RECEIVED','FAILED')
         ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `UPDATE asaas_webhook_inbox SET status='PROCESSING',attempts=attempts+1 WHERE id=$1`,
        [row.id],
      );
      return row;
    });
    if (!claimed) return false;
    try {
      const mapped = paymentEventStatus(claimed.eventType);
      await transaction(async (client) => {
        if (mapped) {
          const result = await client.query<{ id: string; orderId: string; amountCents: string }>(
            `UPDATE payment_charges SET status=$2,version=version+1,updated_at=clock_timestamp()
             WHERE external_charge_id=$1 RETURNING id,order_id AS "orderId",amount_cents::text AS "amountCents"`,
            [claimed.externalChargeId, mapped],
          );
          const charge = result.rows[0];
          if (charge) {
            if (mapped === 'CONFIRMED' || mapped === 'RECEIVED') {
              await client.query(
                `UPDATE orders SET paid_amount_cents=GREATEST(paid_amount_cents,$2),
                updated_at=clock_timestamp() WHERE id=$1`,
                [charge.orderId, charge.amountCents],
              );
              await this.evaluateAndReserve(
                client,
                null,
                charge.orderId,
                false,
                undefined,
                randomUUID(),
              );
            }
            if (['REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK'].includes(mapped)) {
              const order = await this.orderRow(charge.orderId, client, true);
              if (order.status !== 'CANCELLED' && order.status !== 'FINANCIAL_REVIEW') {
                assertOrderTransition(order.status, 'FINANCIAL_REVIEW');
                await client.query(
                  `UPDATE orders SET status='FINANCIAL_REVIEW',version=version+1,
                  updated_at=clock_timestamp() WHERE id=$1`,
                  [charge.orderId],
                );
                const manager = await this.systemActor(client);
                await client.query(
                  `INSERT INTO financial_decisions(id,order_id,type,reason,amount_cents,created_by)
                  VALUES($1,$2,'PAYMENT_REVIEW_REQUIRED',$3,$4,$5)`,
                  [
                    randomUUID(),
                    charge.orderId,
                    `Evento financeiro ${mapped} exige revisão.`,
                    charge.amountCents,
                    manager,
                  ],
                );
                await this.recordState(
                  client,
                  charge.orderId,
                  order.status,
                  'FINANCIAL_REVIEW',
                  `Evento Asaas ${mapped}.`,
                  'SYSTEM',
                  null,
                  randomUUID(),
                );
              }
            }
          }
        }
        await client.query(
          `UPDATE asaas_webhook_inbox SET status='PROCESSED',processed_at=clock_timestamp(),
          last_error_code=NULL WHERE id=$1`,
          [claimed.id],
        );
        await audit(client, {
          actorType: 'SYSTEM',
          action: 'ASAAS_WEBHOOK_PROCESSED',
          resourceType: 'asaas_webhook_event',
          resourceId: claimed.id,
          correlationId: randomUUID(),
          after: { eventType: claimed.eventType, recognized: mapped !== null },
        });
      }, 'SERIALIZABLE');
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'WEBHOOK_PROCESSING_FAILED';
      await pool.query(
        `UPDATE asaas_webhook_inbox SET status='FAILED',last_error_code=$2 WHERE id=$1`,
        [claimed.id, code],
      );
    }
    return true;
  }
}
