import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CurrentActor, Page } from '@north/application';
import type { DatabaseClient } from '@north/database';
import { pool, transaction } from '@north/database';
import { assertRole, DomainError, normalizeMaterialCode } from '@north/domain';
import {
  commercialAudit,
  decodeCommercialCursor,
  encodeCommercialCursor,
  lockIdempotency,
  recordIdempotency,
} from './commercial-shared.js';

type RecordStatus = 'ACTIVE' | 'INACTIVE';

interface CustomerInput {
  type: 'PERSON' | 'COMPANY';
  displayName: string;
  businessName?: string;
  email?: string;
  phone?: string;
  operationalNote?: string;
}

interface CatalogInput {
  code: string;
  name: string;
  description?: string;
}

interface SheetComponentInput {
  materialId: string;
  quantity: string;
  unit: string;
}

interface SheetInput {
  combinationId: string;
  yieldQuantity: string;
  lossBps: number;
  technicalNote?: string;
  components: SheetComponentInput[];
}

interface PricingComponentInput {
  name: string;
  type: 'FIXED_QUOTE' | 'FIXED_UNIT' | 'PERCENT_MATERIAL';
  amountCents?: number;
  rateBps?: number;
  status: RecordStatus;
  displayOrder: number;
  includeInCostBase: boolean;
}

interface PricingPolicyInput {
  method: 'MARKUP' | 'MARGIN';
  rateBps: number;
  employeeDiscountLimitBps: number;
  managerDiscountLimitBps: number;
  discountOptionsBps: number[];
  effectiveAt: string;
  components: PricingComponentInput[];
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function catalogPublic(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return row;
}

function customerPublic(row: {
  id: string;
  type: 'PERSON' | 'COMPANY';
  displayName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  operationalNote: string | null;
  status: RecordStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return row;
}

@Injectable()
export class CatalogRepository {
  async listCustomers(input: {
    search?: string;
    status?: string;
    cursor?: string;
  }): Promise<Page<unknown>> {
    const cursor = decodeCommercialCursor(input.cursor);
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.search?.trim()) {
      values.push(`%${input.search.trim()}%`);
      where.push(
        `(display_name ILIKE $${values.length} OR email ILIKE $${values.length} OR phone ILIKE $${values.length})`,
      );
    }
    if (input.status) {
      values.push(input.status);
      where.push(`status=$${values.length}`);
    }
    if (cursor) {
      values.push(cursor.value, cursor.id);
      where.push(`(normalized_display_name,id)>($${values.length - 1},$${values.length}::uuid)`);
    }
    values.push(21);
    const result = await pool.query<{
      id: string;
      type: 'PERSON' | 'COMPANY';
      displayName: string;
      businessName: string | null;
      email: string | null;
      phone: string | null;
      operationalNote: string | null;
      status: RecordStatus;
      version: number;
      normalizedDisplayName: string;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id,type,display_name AS "displayName",business_name AS "businessName",email,phone,
              operational_note AS "operationalNote",status,version,
              normalized_display_name AS "normalizedDisplayName",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM customers ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY normalized_display_name,id LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 20;
    const items = result.rows.slice(0, 20);
    const last = items.at(-1);
    return {
      items: items.map((row) => customerPublic(row)),
      nextCursor:
        hasMore && last
          ? encodeCommercialCursor({ value: last.normalizedDisplayName, id: last.id })
          : null,
    };
  }

  async getCustomer(id: string, client: Pick<DatabaseClient, 'query'> = pool) {
    const result = await client.query<{
      id: string;
      type: 'PERSON' | 'COMPANY';
      displayName: string;
      businessName: string | null;
      email: string | null;
      phone: string | null;
      operationalNote: string | null;
      status: RecordStatus;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id,type,display_name AS "displayName",business_name AS "businessName",email,phone,
              operational_note AS "operationalNote",status,version,
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM customers WHERE id=$1`,
      [id],
    );
    const customer = result.rows[0];
    if (!customer) throw new DomainError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    return customer;
  }

  async createCustomer(actor: CurrentActor, input: CustomerInput, correlationId: string) {
    const id = randomUUID();
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO customers
           (id,type,display_name,normalized_display_name,business_name,email,phone,operational_note,
            status,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$9)`,
        [
          id,
          input.type,
          input.displayName.trim(),
          normalizeName(input.displayName),
          input.businessName?.trim() || null,
          input.email?.trim().toLocaleLowerCase('en-US') || null,
          input.phone?.trim() || null,
          input.operationalNote?.trim() || null,
          actor.id,
        ],
      );
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'CUSTOMER_CREATED',
        resourceType: 'customer',
        resourceId: id,
        correlationId,
        after: { type: input.type, status: 'ACTIVE', version: 1 },
      });
    });
    return this.getCustomer(id);
  }

  async updateCustomer(
    actor: CurrentActor,
    id: string,
    input: Partial<CustomerInput> & { version: number; status?: RecordStatus },
    correlationId: string,
  ) {
    return transaction(async (client) => {
      const current = await this.getCustomer(id, client);
      if (current.version !== input.version) {
        throw new DomainError(
          'CUSTOMER_VERSION_CONFLICT',
          'O cliente foi alterado por outra sessão.',
          409,
        );
      }
      const displayName = input.displayName?.trim() ?? current.displayName;
      const updated = await client.query(
        `UPDATE customers
         SET type=$2,display_name=$3,normalized_display_name=$4,business_name=$5,email=$6,phone=$7,
             operational_note=$8,status=$9,version=version+1,updated_by=$10,updated_at=clock_timestamp()
         WHERE id=$1 AND version=$11`,
        [
          id,
          input.type ?? current.type,
          displayName,
          normalizeName(displayName),
          input.businessName === undefined
            ? current.businessName
            : input.businessName.trim() || null,
          input.email === undefined
            ? current.email
            : input.email.trim().toLocaleLowerCase('en-US') || null,
          input.phone === undefined ? current.phone : input.phone.trim() || null,
          input.operationalNote === undefined
            ? current.operationalNote
            : input.operationalNote.trim() || null,
          input.status ?? current.status,
          actor.id,
          input.version,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError(
          'CUSTOMER_VERSION_CONFLICT',
          'O cliente foi alterado por outra sessão.',
          409,
        );
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'CUSTOMER_UPDATED',
        resourceType: 'customer',
        resourceId: id,
        correlationId,
        before: { type: current.type, status: current.status, version: current.version },
        after: {
          type: input.type ?? current.type,
          status: input.status ?? current.status,
          version: current.version + 1,
          changedFields: Object.keys(input).filter((key) => key !== 'version'),
        },
      });
      return this.getCustomer(id, client);
    });
  }

  private async listCatalogTable(
    table: 'products' | 'customization_techniques',
    input: { search?: string; status?: string; cursor?: string },
  ): Promise<Page<unknown>> {
    const cursor = decodeCommercialCursor(input.cursor);
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.search?.trim()) {
      values.push(`%${input.search.trim()}%`);
      where.push(`(normalized_code ILIKE $${values.length} OR name ILIKE $${values.length})`);
    }
    if (input.status) {
      values.push(input.status);
      where.push(`status=$${values.length}`);
    }
    if (cursor) {
      values.push(cursor.value, cursor.id);
      where.push(`(normalized_code,id)>($${values.length - 1},$${values.length}::uuid)`);
    }
    values.push(51);
    const result = await pool.query<{
      id: string;
      code: string;
      normalizedCode: string;
      name: string;
      description: string | null;
      status: RecordStatus;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id,code,normalized_code AS "normalizedCode",name,description,status,version,
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM ${table} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY normalized_code,id LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 50;
    const items = result.rows.slice(0, 50);
    const last = items.at(-1);
    return {
      items: items.map((row) => catalogPublic(row)),
      nextCursor:
        hasMore && last
          ? encodeCommercialCursor({ value: last.normalizedCode, id: last.id })
          : null,
    };
  }

  listProducts(input: { search?: string; status?: string; cursor?: string }) {
    return this.listCatalogTable('products', input);
  }

  listTechniques(input: { search?: string; status?: string; cursor?: string }) {
    return this.listCatalogTable('customization_techniques', input);
  }

  private async getCatalogRecord(
    table: 'products' | 'customization_techniques',
    code: 'PRODUCT' | 'TECHNIQUE',
    id: string,
    client: Pick<DatabaseClient, 'query'> = pool,
  ) {
    const result = await client.query<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      status: RecordStatus;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id,code,name,description,status,version,created_at AS "createdAt",updated_at AS "updatedAt"
       FROM ${table} WHERE id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row)
      throw new DomainError(`${code}_NOT_FOUND`, 'Registro de catálogo não encontrado.', 404);
    return catalogPublic(row);
  }

  getProduct(id: string) {
    return this.getCatalogRecord('products', 'PRODUCT', id);
  }

  getTechnique(id: string) {
    return this.getCatalogRecord('customization_techniques', 'TECHNIQUE', id);
  }

  private async createCatalogRecord(
    actor: CurrentActor,
    table: 'products' | 'customization_techniques',
    resourceType: 'product' | 'customization_technique',
    input: CatalogInput,
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    const id = randomUUID();
    try {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO ${table}
             (id,code,normalized_code,name,description,status,created_by,updated_by)
           VALUES($1,$2,$3,$4,$5,'ACTIVE',$6,$6)`,
          [
            id,
            input.code.trim(),
            normalizeMaterialCode(input.code),
            input.name.trim(),
            input.description?.trim() || null,
            actor.id,
          ],
        );
        await commercialAudit(client, {
          actorId: actor.id,
          action: `${resourceType.toLocaleUpperCase('en-US')}_CREATED`,
          resourceType,
          resourceId: id,
          correlationId,
          after: { code: input.code, name: input.name, status: 'ACTIVE', version: 1 },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new DomainError(
          'CATALOG_CODE_ALREADY_EXISTS',
          'Código de catálogo já utilizado.',
          409,
        );
      }
      throw error;
    }
    return this.getCatalogRecord(table, resourceType === 'product' ? 'PRODUCT' : 'TECHNIQUE', id);
  }

  createProduct(actor: CurrentActor, input: CatalogInput, correlationId: string) {
    return this.createCatalogRecord(actor, 'products', 'product', input, correlationId);
  }

  createTechnique(actor: CurrentActor, input: CatalogInput, correlationId: string) {
    return this.createCatalogRecord(
      actor,
      'customization_techniques',
      'customization_technique',
      input,
      correlationId,
    );
  }

  private async updateCatalogRecord(
    actor: CurrentActor,
    table: 'products' | 'customization_techniques',
    resourceType: 'product' | 'customization_technique',
    id: string,
    input: Partial<CatalogInput> & { version: number; status?: RecordStatus },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const current = await this.getCatalogRecord(
        table,
        resourceType === 'product' ? 'PRODUCT' : 'TECHNIQUE',
        id,
        client,
      );
      if (current.version !== input.version) {
        throw new DomainError(
          'CATALOG_VERSION_CONFLICT',
          'O cadastro foi alterado por outra sessão.',
          409,
        );
      }
      const nextCode = input.code?.trim() ?? current.code;
      const updated = await client.query(
        `UPDATE ${table}
         SET code=$2,normalized_code=$3,name=$4,description=$5,status=$6,
             version=version+1,updated_by=$7,updated_at=clock_timestamp()
         WHERE id=$1 AND version=$8`,
        [
          id,
          nextCode,
          normalizeMaterialCode(nextCode),
          input.name?.trim() ?? current.name,
          input.description === undefined ? current.description : input.description.trim() || null,
          input.status ?? current.status,
          actor.id,
          input.version,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError(
          'CATALOG_VERSION_CONFLICT',
          'O cadastro foi alterado por outra sessão.',
          409,
        );
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: `${resourceType.toLocaleUpperCase('en-US')}_UPDATED`,
        resourceType,
        resourceId: id,
        correlationId,
        before: current,
        after: { ...input, version: current.version + 1 },
      });
      return this.getCatalogRecord(
        table,
        resourceType === 'product' ? 'PRODUCT' : 'TECHNIQUE',
        id,
        client,
      );
    });
  }

  updateProduct(
    actor: CurrentActor,
    id: string,
    input: Partial<CatalogInput> & { version: number; status?: RecordStatus },
    correlationId: string,
  ) {
    return this.updateCatalogRecord(actor, 'products', 'product', id, input, correlationId);
  }

  updateTechnique(
    actor: CurrentActor,
    id: string,
    input: Partial<CatalogInput> & { version: number; status?: RecordStatus },
    correlationId: string,
  ) {
    return this.updateCatalogRecord(
      actor,
      'customization_techniques',
      'customization_technique',
      id,
      input,
      correlationId,
    );
  }

  async listVariants(productId?: string) {
    const result = await pool.query<{
      id: string;
      productId: string;
      productName: string;
      code: string;
      name: string;
      description: string | null;
      status: RecordStatus;
      version: number;
    }>(
      `SELECT v.id,v.product_id AS "productId",p.name AS "productName",v.code,v.name,v.description,
              v.status,v.version
       FROM product_variants v JOIN products p ON p.id=v.product_id
       WHERE ($1::uuid IS NULL OR v.product_id=$1)
       ORDER BY p.normalized_code,v.normalized_code,v.id`,
      [productId ?? null],
    );
    return { items: result.rows };
  }

  async getVariant(id: string, client: Pick<DatabaseClient, 'query'> = pool) {
    const result = await client.query<{
      id: string;
      productId: string;
      productName: string;
      code: string;
      name: string;
      description: string | null;
      status: RecordStatus;
      version: number;
    }>(
      `SELECT v.id,v.product_id AS "productId",p.name AS "productName",v.code,v.name,v.description,
              v.status,v.version
       FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1`,
      [id],
    );
    if (!result.rows[0])
      throw new DomainError('VARIANT_NOT_FOUND', 'Variante não encontrada.', 404);
    return result.rows[0];
  }

  async createVariant(
    actor: CurrentActor,
    input: CatalogInput & { productId: string },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    const id = randomUUID();
    await transaction(async (client) => {
      const product = await client.query<{ status: string }>(
        'SELECT status FROM products WHERE id=$1',
        [input.productId],
      );
      if (!product.rows[0])
        throw new DomainError('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 404);
      await client.query(
        `INSERT INTO product_variants
           (id,product_id,code,normalized_code,name,description,status,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$7)`,
        [
          id,
          input.productId,
          input.code.trim(),
          normalizeMaterialCode(input.code),
          input.name.trim(),
          input.description?.trim() || null,
          actor.id,
        ],
      );
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'PRODUCT_VARIANT_CREATED',
        resourceType: 'product_variant',
        resourceId: id,
        correlationId,
        after: { productId: input.productId, code: input.code, status: 'ACTIVE', version: 1 },
      });
    });
    return this.getVariant(id);
  }

  async updateVariant(
    actor: CurrentActor,
    id: string,
    input: Partial<CatalogInput> & { version: number; status?: RecordStatus },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const current = await this.getVariant(id, client);
      if (current.version !== input.version) {
        throw new DomainError(
          'CATALOG_VERSION_CONFLICT',
          'A variante foi alterada por outra sessão.',
          409,
        );
      }
      const nextCode = input.code?.trim() ?? current.code;
      const updated = await client.query(
        `UPDATE product_variants
         SET code=$2,normalized_code=$3,name=$4,description=$5,status=$6,
             version=version+1,updated_by=$7,updated_at=clock_timestamp()
         WHERE id=$1 AND version=$8`,
        [
          id,
          nextCode,
          normalizeMaterialCode(nextCode),
          input.name?.trim() ?? current.name,
          input.description === undefined ? current.description : input.description.trim() || null,
          input.status ?? current.status,
          actor.id,
          input.version,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError(
          'CATALOG_VERSION_CONFLICT',
          'A variante foi alterada por outra sessão.',
          409,
        );
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'PRODUCT_VARIANT_UPDATED',
        resourceType: 'product_variant',
        resourceId: id,
        correlationId,
        before: current,
        after: { ...input, version: current.version + 1 },
      });
      return this.getVariant(id, client);
    });
  }

  async listCombinations(status?: string) {
    const result = await pool.query(
      `SELECT c.id,c.status,c.version,
              p.id AS "productId",p.code AS "productCode",p.name AS "productName",
              v.id AS "variantId",v.code AS "variantCode",v.name AS "variantName",
              t.id AS "techniqueId",t.code AS "techniqueCode",t.name AS "techniqueName"
       FROM catalog_combinations c
       JOIN products p ON p.id=c.product_id
       JOIN product_variants v ON v.id=c.variant_id
       JOIN customization_techniques t ON t.id=c.technique_id
       WHERE ($1::text IS NULL OR c.status=$1)
       ORDER BY p.normalized_code,v.normalized_code,t.normalized_code,c.id`,
      [status ?? null],
    );
    return { items: result.rows };
  }

  async getCombination(id: string, client: Pick<DatabaseClient, 'query'> = pool) {
    const result = await client.query<{
      id: string;
      status: RecordStatus;
      version: number;
      productId: string;
      productCode: string;
      productName: string;
      productStatus: RecordStatus;
      variantId: string;
      variantCode: string;
      variantName: string;
      variantStatus: RecordStatus;
      techniqueId: string;
      techniqueCode: string;
      techniqueName: string;
      techniqueStatus: RecordStatus;
    }>(
      `SELECT c.id,c.status,c.version,
              p.id AS "productId",p.code AS "productCode",p.name AS "productName",
              p.status AS "productStatus",
              v.id AS "variantId",v.code AS "variantCode",v.name AS "variantName",
              v.status AS "variantStatus",
              t.id AS "techniqueId",t.code AS "techniqueCode",t.name AS "techniqueName",
              t.status AS "techniqueStatus"
       FROM catalog_combinations c
       JOIN products p ON p.id=c.product_id
       JOIN product_variants v ON v.id=c.variant_id
       JOIN customization_techniques t ON t.id=c.technique_id
       WHERE c.id=$1`,
      [id],
    );
    if (!result.rows[0])
      throw new DomainError('COMBINATION_NOT_FOUND', 'Combinação de catálogo não encontrada.', 404);
    return result.rows[0];
  }

  async createCombination(
    actor: CurrentActor,
    input: { productId: string; variantId: string; techniqueId: string },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    const id = randomUUID();
    await transaction(async (client) => {
      const variant = await client.query<{ productId: string }>(
        'SELECT product_id AS "productId" FROM product_variants WHERE id=$1',
        [input.variantId],
      );
      if (!variant.rows[0] || variant.rows[0].productId !== input.productId) {
        throw new DomainError(
          'VARIANT_PRODUCT_MISMATCH',
          'A variante não pertence ao produto informado.',
          422,
        );
      }
      const technique = await client.query('SELECT id FROM customization_techniques WHERE id=$1', [
        input.techniqueId,
      ]);
      if (!technique.rowCount)
        throw new DomainError('TECHNIQUE_NOT_FOUND', 'Técnica não encontrada.', 404);
      await client.query(
        `INSERT INTO catalog_combinations
           (id,product_id,variant_id,technique_id,status,created_by,updated_by)
         VALUES($1,$2,$3,$4,'ACTIVE',$5,$5)`,
        [id, input.productId, input.variantId, input.techniqueId, actor.id],
      );
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'CATALOG_COMBINATION_CREATED',
        resourceType: 'catalog_combination',
        resourceId: id,
        correlationId,
        after: { ...input, status: 'ACTIVE', version: 1 },
      });
    });
    return this.getCombination(id);
  }

  async updateCombination(
    actor: CurrentActor,
    id: string,
    input: { version: number; status: RecordStatus },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const current = await this.getCombination(id, client);
      if (current.version !== input.version) {
        throw new DomainError('CATALOG_VERSION_CONFLICT', 'A combinação foi alterada.', 409);
      }
      const updated = await client.query(
        `UPDATE catalog_combinations
         SET status=$2,version=version+1,updated_by=$3,updated_at=clock_timestamp()
         WHERE id=$1 AND version=$4`,
        [id, input.status, actor.id, input.version],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError('CATALOG_VERSION_CONFLICT', 'A combinação foi alterada.', 409);
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'CATALOG_COMBINATION_UPDATED',
        resourceType: 'catalog_combination',
        resourceId: id,
        correlationId,
        before: { status: current.status, version: current.version },
        after: { status: input.status, version: current.version + 1 },
      });
      return this.getCombination(id, client);
    });
  }

  async listTechnicalSheets(combinationId?: string) {
    const result = await pool.query(
      `SELECT s.id,s.combination_id AS "combinationId",s.version_number AS "versionNumber",
              s.record_version AS "recordVersion",s.status,s.yield_quantity::text AS "yieldQuantity",
              s.loss_bps AS "lossBps",s.technical_note AS "technicalNote",
              s.previous_sheet_id AS "previousSheetId",s.activated_at AS "activatedAt",
              s.created_at AS "createdAt",p.name AS "productName",v.name AS "variantName",
              t.name AS "techniqueName"
       FROM technical_sheets s
       JOIN catalog_combinations c ON c.id=s.combination_id
       JOIN products p ON p.id=c.product_id
       JOIN product_variants v ON v.id=c.variant_id
       JOIN customization_techniques t ON t.id=c.technique_id
       WHERE ($1::uuid IS NULL OR s.combination_id=$1)
       ORDER BY p.normalized_code,v.normalized_code,t.normalized_code,s.version_number DESC`,
      [combinationId ?? null],
    );
    return { items: result.rows };
  }

  async getTechnicalSheet(id: string, client: Pick<DatabaseClient, 'query'> = pool) {
    const sheet = await client.query<{
      id: string;
      combinationId: string;
      versionNumber: number;
      recordVersion: number;
      status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
      yieldQuantity: string;
      lossBps: number;
      technicalNote: string | null;
      previousSheetId: string | null;
      createdBy: string;
      activatedBy: string | null;
      activatedAt: Date | null;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id,combination_id AS "combinationId",version_number AS "versionNumber",
              record_version AS "recordVersion",status,yield_quantity::text AS "yieldQuantity",
              loss_bps AS "lossBps",technical_note AS "technicalNote",
              previous_sheet_id AS "previousSheetId",created_by AS "createdBy",
              activated_by AS "activatedBy",activated_at AS "activatedAt",archived_at AS "archivedAt",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM technical_sheets WHERE id=$1`,
      [id],
    );
    const row = sheet.rows[0];
    if (!row)
      throw new DomainError('TECHNICAL_SHEET_NOT_FOUND', 'Ficha técnica não encontrada.', 404);
    const components = await client.query<{
      id: string;
      materialId: string;
      materialCode: string;
      materialName: string;
      materialStatus: RecordStatus;
      quantity: string;
      unit: string;
      displayOrder: number;
    }>(
      `SELECT c.id,c.material_id AS "materialId",m.code AS "materialCode",m.name AS "materialName",
              m.status AS "materialStatus",c.quantity::text AS quantity,c.unit,
              c.display_order AS "displayOrder"
       FROM technical_sheet_components c JOIN materials m ON m.id=c.material_id
       WHERE c.technical_sheet_id=$1 ORDER BY c.display_order,c.id`,
      [id],
    );
    return { ...row, components: components.rows };
  }

  private async validateSheetComponents(
    client: DatabaseClient,
    components: SheetComponentInput[],
    requireActive: boolean,
  ): Promise<void> {
    for (const component of components) {
      const material = await client.query<{ baseUnit: string; status: RecordStatus }>(
        'SELECT base_unit AS "baseUnit",status FROM materials WHERE id=$1',
        [component.materialId],
      );
      const row = material.rows[0];
      if (!row) throw new DomainError('MATERIAL_NOT_FOUND', 'Material não encontrado.', 404);
      if (row.baseUnit !== component.unit) {
        throw new DomainError(
          'MATERIAL_UNIT_MISMATCH',
          'A unidade do componente deve coincidir com a unidade-base do material.',
          422,
        );
      }
      if (requireActive && row.status !== 'ACTIVE') {
        throw new DomainError(
          'MATERIAL_INACTIVE',
          'Material inativo não pode compor uma nova ficha ativa.',
          422,
        );
      }
    }
  }

  async createTechnicalSheet(actor: CurrentActor, input: SheetInput, correlationId: string) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `technical-sheet:${input.combinationId}`,
      ]);
      await this.getCombination(input.combinationId, client);
      await this.validateSheetComponents(client, input.components, false);
      const nextVersion = await client.query<{ version: number }>(
        'SELECT COALESCE(max(version_number),0)+1 AS version FROM technical_sheets WHERE combination_id=$1',
        [input.combinationId],
      );
      const id = randomUUID();
      await client.query(
        `INSERT INTO technical_sheets
           (id,combination_id,version_number,status,yield_quantity,loss_bps,technical_note,created_by)
         VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7)`,
        [
          id,
          input.combinationId,
          nextVersion.rows[0]!.version,
          input.yieldQuantity,
          input.lossBps,
          input.technicalNote?.trim() || null,
          actor.id,
        ],
      );
      for (const [index, component] of input.components.entries()) {
        await client.query(
          `INSERT INTO technical_sheet_components
             (id,technical_sheet_id,material_id,quantity,unit,display_order)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), id, component.materialId, component.quantity, component.unit, index],
        );
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'TECHNICAL_SHEET_DRAFT_CREATED',
        resourceType: 'technical_sheet',
        resourceId: id,
        correlationId,
        after: {
          combinationId: input.combinationId,
          versionNumber: nextVersion.rows[0]!.version,
          status: 'DRAFT',
          componentCount: input.components.length,
        },
      });
      return this.getTechnicalSheet(id, client);
    }, 'SERIALIZABLE');
  }

  async updateTechnicalSheet(
    actor: CurrentActor,
    id: string,
    input: {
      version: number;
      yieldQuantity?: string;
      lossBps?: number;
      technicalNote?: string;
      components?: SheetComponentInput[];
    },
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const current = await this.getTechnicalSheet(id, client);
      if (current.status !== 'DRAFT') {
        throw new DomainError(
          'TECHNICAL_SHEET_IMMUTABLE',
          'Ficha ativa ou arquivada não pode ser sobrescrita.',
          409,
        );
      }
      if (current.recordVersion !== input.version) {
        throw new DomainError(
          'TECHNICAL_SHEET_VERSION_CONFLICT',
          'A ficha técnica foi alterada por outra sessão.',
          409,
        );
      }
      if (input.components) await this.validateSheetComponents(client, input.components, false);
      const updated = await client.query(
        `UPDATE technical_sheets
         SET yield_quantity=$2,loss_bps=$3,technical_note=$4,record_version=record_version+1,
             updated_at=clock_timestamp()
         WHERE id=$1 AND record_version=$5`,
        [
          id,
          input.yieldQuantity ?? current.yieldQuantity,
          input.lossBps ?? current.lossBps,
          input.technicalNote === undefined
            ? current.technicalNote
            : input.technicalNote.trim() || null,
          input.version,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError(
          'TECHNICAL_SHEET_VERSION_CONFLICT',
          'A ficha técnica foi alterada por outra sessão.',
          409,
        );
      }
      if (input.components) {
        await client.query('DELETE FROM technical_sheet_components WHERE technical_sheet_id=$1', [
          id,
        ]);
        for (const [index, component] of input.components.entries()) {
          await client.query(
            `INSERT INTO technical_sheet_components
               (id,technical_sheet_id,material_id,quantity,unit,display_order)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [randomUUID(), id, component.materialId, component.quantity, component.unit, index],
          );
        }
      }
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'TECHNICAL_SHEET_DRAFT_UPDATED',
        resourceType: 'technical_sheet',
        resourceId: id,
        correlationId,
        before: { status: current.status, recordVersion: current.recordVersion },
        after: { status: 'DRAFT', recordVersion: current.recordVersion + 1 },
      });
      return this.getTechnicalSheet(id, client);
    });
  }

  async activateTechnicalSheet(
    actor: CurrentActor,
    id: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const idempotency = await lockIdempotency(client, {
        scope: `POST:/technical-sheets/${id}/activate`,
        key: idempotencyKey,
        payload: { id },
      });
      if (idempotency.replayResourceId) return this.getTechnicalSheet(id, client);
      const current = await this.getTechnicalSheet(id, client);
      if (current.status !== 'DRAFT') {
        throw new DomainError(
          'TECHNICAL_SHEET_NOT_DRAFT',
          'Somente rascunho pode ser ativado.',
          409,
        );
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `technical-sheet:${current.combinationId}`,
      ]);
      await this.validateSheetComponents(
        client,
        current.components.map((component) => ({
          materialId: component.materialId,
          quantity: component.quantity,
          unit: component.unit,
        })),
        true,
      );
      await client.query(
        `UPDATE technical_sheets
         SET status='ARCHIVED',archived_at=clock_timestamp()
         WHERE combination_id=$1 AND status='ACTIVE'`,
        [current.combinationId],
      );
      await client.query(
        `UPDATE technical_sheets
         SET status='ACTIVE',activated_by=$2,activated_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE id=$1`,
        [id, actor.id],
      );
      await recordIdempotency(client, {
        scope: `POST:/technical-sheets/${id}/activate`,
        key: idempotencyKey,
        hash: idempotency.hash,
        resourceType: 'technical_sheet',
        resourceId: id,
      });
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'TECHNICAL_SHEET_ACTIVATED',
        resourceType: 'technical_sheet',
        resourceId: id,
        correlationId,
        before: { status: 'DRAFT' },
        after: { status: 'ACTIVE', versionNumber: current.versionNumber },
      });
      return this.getTechnicalSheet(id, client);
    }, 'SERIALIZABLE');
  }

  async reviseTechnicalSheet(
    actor: CurrentActor,
    id: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const idempotency = await lockIdempotency(client, {
        scope: `POST:/technical-sheets/${id}/revise`,
        key: idempotencyKey,
        payload: { id },
      });
      if (idempotency.replayResourceId) {
        return this.getTechnicalSheet(idempotency.replayResourceId, client);
      }
      const source = await this.getTechnicalSheet(id, client);
      if (source.status === 'DRAFT') {
        throw new DomainError(
          'TECHNICAL_SHEET_REVISION_REQUIRES_ACTIVE',
          'Revise uma ficha ativa ou arquivada.',
          409,
        );
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `technical-sheet:${source.combinationId}`,
      ]);
      const nextVersion = await client.query<{ version: number }>(
        'SELECT max(version_number)+1 AS version FROM technical_sheets WHERE combination_id=$1',
        [source.combinationId],
      );
      const revisionId = randomUUID();
      await client.query(
        `INSERT INTO technical_sheets
           (id,combination_id,version_number,status,yield_quantity,loss_bps,technical_note,
            previous_sheet_id,created_by)
         VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8)`,
        [
          revisionId,
          source.combinationId,
          nextVersion.rows[0]!.version,
          source.yieldQuantity,
          source.lossBps,
          source.technicalNote,
          source.id,
          actor.id,
        ],
      );
      await client.query(
        `INSERT INTO technical_sheet_components
           (id,technical_sheet_id,material_id,quantity,unit,display_order)
         SELECT gen_random_uuid(),$1,material_id,quantity,unit,display_order
         FROM technical_sheet_components WHERE technical_sheet_id=$2`,
        [revisionId, source.id],
      );
      await recordIdempotency(client, {
        scope: `POST:/technical-sheets/${id}/revise`,
        key: idempotencyKey,
        hash: idempotency.hash,
        resourceType: 'technical_sheet',
        resourceId: revisionId,
        status: 201,
      });
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'TECHNICAL_SHEET_REVISION_CREATED',
        resourceType: 'technical_sheet',
        resourceId: revisionId,
        correlationId,
        after: {
          previousSheetId: source.id,
          versionNumber: nextVersion.rows[0]!.version,
          status: 'DRAFT',
        },
      });
      return this.getTechnicalSheet(revisionId, client);
    }, 'SERIALIZABLE');
  }

  async getPricingPolicy(
    client: Pick<DatabaseClient, 'query'> = pool,
    policyId?: string,
  ): Promise<{
    id: string;
    versionNumber: number;
    status: string;
    method: 'MARKUP' | 'MARGIN';
    rateBps: number;
    effectiveAt: Date;
    employeeDiscountLimitBps: number;
    managerDiscountLimitBps: number;
    discountOptionsBps: number[];
    components: Array<{
      id: string;
      name: string;
      type: 'FIXED_QUOTE' | 'FIXED_UNIT' | 'PERCENT_MATERIAL';
      amountCents: string | null;
      rateBps: number | null;
      status: RecordStatus;
      displayOrder: number;
      includeInCostBase: boolean;
    }>;
  }> {
    const policy = await client.query<{
      id: string;
      versionNumber: number;
      status: string;
      method: 'MARKUP' | 'MARGIN';
      rateBps: number;
      effectiveAt: Date;
      employeeDiscountLimitBps: number;
      managerDiscountLimitBps: number;
    }>(
      `SELECT p.id,p.version_number AS "versionNumber",p.status,p.method,p.rate_bps AS "rateBps",
              p.effective_at AS "effectiveAt",d.employee_limit_bps AS "employeeDiscountLimitBps",
              d.manager_limit_bps AS "managerDiscountLimitBps"
       FROM pricing_policies p JOIN discount_policies d ON d.pricing_policy_id=p.id
       WHERE ${policyId ? 'p.id=$1' : "p.status='ACTIVE' AND p.effective_at<=clock_timestamp()"}
       ORDER BY p.effective_at DESC,p.version_number DESC LIMIT 1`,
      policyId ? [policyId] : [],
    );
    const row = policy.rows[0];
    if (!row)
      throw new DomainError('PRICING_POLICY_NOT_FOUND', 'Política de preço não configurada.', 404);
    const components = await client.query<{
      id: string;
      name: string;
      type: 'FIXED_QUOTE' | 'FIXED_UNIT' | 'PERCENT_MATERIAL';
      amountCents: string | null;
      rateBps: number | null;
      status: RecordStatus;
      displayOrder: number;
      includeInCostBase: boolean;
    }>(
      `SELECT id,name,type,amount_cents::text AS "amountCents",rate_bps AS "rateBps",status,
              display_order AS "displayOrder",include_in_cost_base AS "includeInCostBase"
       FROM pricing_components WHERE pricing_policy_id=$1 ORDER BY display_order,id`,
      [row.id],
    );
    const options = await client.query<{ discountBps: number }>(
      `SELECT discount_bps AS "discountBps" FROM discount_policy_options
       WHERE discount_policy_id=(SELECT id FROM discount_policies WHERE pricing_policy_id=$1)
       ORDER BY display_order,id`,
      [row.id],
    );
    return {
      ...row,
      discountOptionsBps: options.rows.map((option) => option.discountBps),
      components: components.rows,
    };
  }

  async putPricingPolicy(
    actor: CurrentActor,
    input: PricingPolicyInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    assertRole(actor.role, ['MANAGER']);
    return transaction(async (client) => {
      const idempotency = await lockIdempotency(client, {
        scope: 'PUT:/pricing/policy',
        key: idempotencyKey,
        payload: input,
      });
      if (idempotency.replayResourceId) {
        return this.getPricingPolicy(client, idempotency.replayResourceId);
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('pricing-policy',0))");
      const version = await client.query<{ version: number }>(
        'SELECT COALESCE(max(version_number),0)+1 AS version FROM pricing_policies',
      );
      await client.query(
        `UPDATE pricing_policies
         SET status='ARCHIVED',archived_at=clock_timestamp() WHERE status='ACTIVE'`,
      );
      const policyId = randomUUID();
      await client.query(
        `INSERT INTO pricing_policies
           (id,version_number,status,method,rate_bps,effective_at,created_by)
         VALUES($1,$2,'ACTIVE',$3,$4,$5,$6)`,
        [
          policyId,
          version.rows[0]!.version,
          input.method,
          input.rateBps,
          input.effectiveAt,
          actor.id,
        ],
      );
      const discountId = randomUUID();
      await client.query(
        `INSERT INTO discount_policies
           (id,pricing_policy_id,employee_limit_bps,manager_limit_bps,status,effective_at,created_by)
         VALUES($1,$2,$3,$4,'ACTIVE',$5,$6)`,
        [
          discountId,
          policyId,
          input.employeeDiscountLimitBps,
          input.managerDiscountLimitBps,
          input.effectiveAt,
          actor.id,
        ],
      );
      for (const [index, discountBps] of input.discountOptionsBps.entries()) {
        await client.query(
          `INSERT INTO discount_policy_options
             (id,discount_policy_id,discount_bps,display_order)
           VALUES($1,$2,$3,$4)`,
          [randomUUID(), discountId, discountBps, index],
        );
      }
      for (const component of input.components) {
        await client.query(
          `INSERT INTO pricing_components
             (id,pricing_policy_id,name,type,amount_cents,rate_bps,status,display_order,
              include_in_cost_base,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            randomUUID(),
            policyId,
            component.name.trim(),
            component.type,
            component.amountCents ?? null,
            component.rateBps ?? null,
            component.status,
            component.displayOrder,
            component.includeInCostBase,
            actor.id,
          ],
        );
      }
      await recordIdempotency(client, {
        scope: 'PUT:/pricing/policy',
        key: idempotencyKey,
        hash: idempotency.hash,
        resourceType: 'pricing_policy',
        resourceId: policyId,
      });
      await commercialAudit(client, {
        actorId: actor.id,
        action: 'PRICING_POLICY_ACTIVATED',
        resourceType: 'pricing_policy',
        resourceId: policyId,
        correlationId,
        after: {
          versionNumber: version.rows[0]!.version,
          method: input.method,
          rateBps: input.rateBps,
          employeeDiscountLimitBps: input.employeeDiscountLimitBps,
          managerDiscountLimitBps: input.managerDiscountLimitBps,
          discountOptionsBps: input.discountOptionsBps,
          componentCount: input.components.length,
        },
      });
      return this.getPricingPolicy(client, policyId);
    }, 'SERIALIZABLE');
  }
}
