CREATE TABLE customers (
  id uuid PRIMARY KEY,
  type varchar(16) NOT NULL CHECK (type IN ('PERSON', 'COMPANY')),
  display_name varchar(160) NOT NULL,
  normalized_display_name varchar(160) NOT NULL,
  business_name varchar(200),
  email varchar(254),
  phone varchar(40),
  operational_note varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX customers_page_idx ON customers(normalized_display_name, id);
CREATE INDEX customers_search_idx ON customers USING gin (
  to_tsvector('simple', coalesce(display_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,''))
);

CREATE TABLE products (
  id uuid PRIMARY KEY,
  code varchar(40) NOT NULL,
  normalized_code varchar(40) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX products_page_idx ON products(normalized_code, id);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  code varchar(40) NOT NULL,
  normalized_code varchar(40) NOT NULL,
  name varchar(160) NOT NULL,
  description varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(product_id, normalized_code)
);
CREATE INDEX product_variants_page_idx ON product_variants(product_id, normalized_code, id);

CREATE TABLE customization_techniques (
  id uuid PRIMARY KEY,
  code varchar(40) NOT NULL,
  normalized_code varchar(40) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX customization_techniques_page_idx ON customization_techniques(normalized_code, id);

CREATE TABLE catalog_combinations (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  technique_id uuid NOT NULL REFERENCES customization_techniques(id),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(product_id, variant_id, technique_id)
);
CREATE INDEX catalog_combinations_page_idx ON catalog_combinations(product_id, variant_id, technique_id, id);

CREATE TABLE technical_sheets (
  id uuid PRIMARY KEY,
  combination_id uuid NOT NULL REFERENCES catalog_combinations(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  yield_quantity numeric(18,6) NOT NULL CHECK (yield_quantity > 0),
  loss_bps integer NOT NULL DEFAULT 0 CHECK (loss_bps >= 0),
  technical_note varchar(2000),
  previous_sheet_id uuid REFERENCES technical_sheets(id),
  created_by uuid NOT NULL REFERENCES users(id),
  activated_by uuid REFERENCES users(id),
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(combination_id, version_number)
);
CREATE UNIQUE INDEX technical_sheets_one_active_idx ON technical_sheets(combination_id) WHERE status='ACTIVE';
CREATE INDEX technical_sheets_history_idx ON technical_sheets(combination_id, version_number DESC);

CREATE TABLE technical_sheet_components (
  id uuid PRIMARY KEY,
  technical_sheet_id uuid NOT NULL REFERENCES technical_sheets(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit varchar(12) NOT NULL,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(technical_sheet_id, material_id)
);
CREATE INDEX technical_sheet_components_material_idx ON technical_sheet_components(material_id);

CREATE TABLE pricing_policies (
  id uuid PRIMARY KEY,
  version_number integer NOT NULL UNIQUE CHECK (version_number > 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  method varchar(16) NOT NULL CHECK (method IN ('MARKUP', 'MARGIN')),
  rate_bps integer NOT NULL CHECK (rate_bps >= 0 AND (method <> 'MARGIN' OR rate_bps < 10000)),
  effective_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX pricing_policies_one_active_idx ON pricing_policies((status)) WHERE status='ACTIVE';
CREATE INDEX pricing_policies_effective_idx ON pricing_policies(effective_at DESC, version_number DESC);

CREATE TABLE discount_policies (
  id uuid PRIMARY KEY,
  pricing_policy_id uuid NOT NULL UNIQUE REFERENCES pricing_policies(id),
  employee_limit_bps integer NOT NULL CHECK (employee_limit_bps BETWEEN 0 AND 10000),
  manager_limit_bps integer NOT NULL CHECK (manager_limit_bps BETWEEN 0 AND 10000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  effective_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (employee_limit_bps <= manager_limit_bps)
);

CREATE TABLE pricing_components (
  id uuid PRIMARY KEY,
  pricing_policy_id uuid NOT NULL REFERENCES pricing_policies(id),
  name varchar(120) NOT NULL,
  type varchar(24) NOT NULL CHECK (type IN ('FIXED_QUOTE', 'FIXED_UNIT', 'PERCENT_MATERIAL')),
  amount_cents bigint CHECK (amount_cents >= 0),
  rate_bps integer CHECK (rate_bps >= 0),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  include_in_cost_base boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (type='PERCENT_MATERIAL' AND rate_bps IS NOT NULL AND amount_cents IS NULL) OR
    (type IN ('FIXED_QUOTE','FIXED_UNIT') AND amount_cents IS NOT NULL AND rate_bps IS NULL)
  )
);
CREATE INDEX pricing_components_policy_idx ON pricing_components(pricing_policy_id, display_order, id);

CREATE SEQUENCE quote_commercial_number_seq;

CREATE TABLE quotes (
  id uuid PRIMARY KEY,
  commercial_number varchar(32) NOT NULL UNIQUE,
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  previous_quote_id uuid REFERENCES quotes(id),
  root_quote_id uuid REFERENCES quotes(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','SUPERSEDED','CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  pricing_policy_id uuid REFERENCES pricing_policies(id),
  discount_policy_id uuid REFERENCES discount_policies(id),
  pricing_method varchar(16) CHECK (pricing_method IN ('MARKUP','MARGIN')),
  pricing_rate_bps integer CHECK (pricing_rate_bps >= 0),
  discount_bps integer CHECK (discount_bps BETWEEN 0 AND 10000),
  material_cost_cents bigint CHECK (material_cost_cents >= 0),
  additional_cost_cents bigint CHECK (additional_cost_cents >= 0),
  cost_base_cents bigint CHECK (cost_base_cents >= 0),
  suggested_price_cents bigint CHECK (suggested_price_cents >= 0),
  discount_cents bigint CHECK (discount_cents >= 0),
  suggested_final_cents bigint CHECK (suggested_final_cents >= 0),
  manual_final_cents bigint CHECK (manual_final_cents >= 0),
  manual_adjustment_reason varchar(500),
  final_price_cents bigint CHECK (final_price_cents >= 0),
  customer_type_snapshot varchar(16),
  customer_display_name_snapshot varchar(160),
  customer_business_name_snapshot varchar(200),
  snapshot_json jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  issued_by uuid REFERENCES users(id),
  issued_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancelled_at timestamptz,
  cancellation_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='DRAFT' AND issued_at IS NULL) OR (status<>'DRAFT' AND issued_at IS NOT NULL))
);
CREATE INDEX quotes_page_idx ON quotes(created_at DESC, id DESC);
CREATE INDEX quotes_customer_idx ON quotes(customer_id, created_at DESC, id DESC);
CREATE INDEX quotes_root_idx ON quotes(root_quote_id, revision_number);

CREATE TABLE quote_items (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES quotes(id),
  combination_id uuid NOT NULL REFERENCES catalog_combinations(id),
  requested_quantity numeric(18,6) NOT NULL CHECK (requested_quantity > 0),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  product_code_snapshot varchar(40),
  product_name_snapshot varchar(160),
  variant_code_snapshot varchar(40),
  variant_name_snapshot varchar(160),
  technique_code_snapshot varchar(40),
  technique_name_snapshot varchar(160),
  technical_sheet_id uuid REFERENCES technical_sheets(id),
  technical_sheet_version integer,
  yield_quantity_snapshot numeric(18,6),
  loss_bps_snapshot integer,
  material_cost_cents bigint CHECK (material_cost_cents >= 0),
  insufficient_stock boolean,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX quote_items_quote_idx ON quote_items(quote_id, display_order, id);

CREATE TABLE quote_material_snapshots (
  id uuid PRIMARY KEY,
  quote_item_id uuid NOT NULL REFERENCES quote_items(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  material_code varchar(40) NOT NULL,
  material_name varchar(160) NOT NULL,
  unit varchar(12) NOT NULL,
  component_quantity numeric(18,6) NOT NULL,
  base_consumption numeric(18,6) NOT NULL,
  loss_quantity numeric(18,6) NOT NULL,
  total_consumption numeric(18,6) NOT NULL,
  loss_bps integer NOT NULL,
  unit_cost_cents bigint NOT NULL CHECK (unit_cost_cents >= 0),
  total_cost_cents bigint NOT NULL CHECK (total_cost_cents >= 0),
  physical_quantity numeric(18,6) NOT NULL,
  reserved_quantity numeric(18,6) NOT NULL,
  available_quantity numeric(18,6) NOT NULL,
  insufficient_stock boolean NOT NULL,
  material_cost_id uuid NOT NULL REFERENCES material_costs(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX quote_material_snapshots_item_idx ON quote_material_snapshots(quote_item_id, id);

CREATE TABLE quote_pricing_component_snapshots (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES quotes(id),
  pricing_component_id uuid NOT NULL REFERENCES pricing_components(id),
  name varchar(120) NOT NULL,
  type varchar(24) NOT NULL,
  amount_cents bigint,
  rate_bps integer,
  calculated_cents bigint NOT NULL CHECK (calculated_cents >= 0),
  include_in_cost_base boolean NOT NULL,
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX quote_pricing_component_snapshots_quote_idx ON quote_pricing_component_snapshots(quote_id, display_order, id);

CREATE FUNCTION protect_technical_sheet_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sheet_status varchar(16);
BEGIN
  IF TG_TABLE_NAME='technical_sheet_components' THEN
    SELECT status INTO sheet_status FROM technical_sheets WHERE id=COALESCE(NEW.technical_sheet_id, OLD.technical_sheet_id);
    IF sheet_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'technical sheet components are immutable after activation' USING ERRCODE='55000';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' AND OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'active or archived technical sheet is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status <> 'DRAFT' THEN
    IF OLD.status='ACTIVE' AND NEW.status='ARCHIVED'
       AND (to_jsonb(NEW) - ARRAY['status','archived_at','updated_at'])
         = (to_jsonb(OLD) - ARRAY['status','archived_at','updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'active or archived technical sheet is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER technical_sheets_protect
BEFORE UPDATE OR DELETE ON technical_sheets
FOR EACH ROW EXECUTE FUNCTION protect_technical_sheet_version();
CREATE TRIGGER technical_sheet_components_protect
BEFORE UPDATE OR DELETE ON technical_sheet_components
FOR EACH ROW EXECUTE FUNCTION protect_technical_sheet_version();

CREATE FUNCTION protect_pricing_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='pricing_policies' AND TG_OP='UPDATE'
     AND OLD.status='ACTIVE' AND NEW.status='ARCHIVED'
     AND (to_jsonb(NEW) - ARRAY['status','archived_at'])
       = (to_jsonb(OLD) - ARRAY['status','archived_at']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'pricing versions are append-only' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER pricing_policies_append_only
BEFORE UPDATE OR DELETE ON pricing_policies
FOR EACH ROW EXECUTE FUNCTION protect_pricing_version();
CREATE TRIGGER discount_policies_append_only
BEFORE UPDATE OR DELETE ON discount_policies
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
CREATE TRIGGER pricing_components_append_only
BEFORE UPDATE OR DELETE ON pricing_components
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();

CREATE FUNCTION protect_quote() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quote_status varchar(16);
BEGIN
  IF TG_TABLE_NAME='quotes' THEN
    IF TG_OP='DELETE' AND OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'issued quote is immutable' USING ERRCODE='55000';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status <> 'DRAFT' THEN
      IF OLD.status='ISSUED' AND NEW.status='SUPERSEDED'
         AND (to_jsonb(NEW) - ARRAY['status','updated_at'])
           = (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN
        RETURN NEW;
      END IF;
      IF OLD.status='ISSUED' AND NEW.status='CANCELLED'
         AND (to_jsonb(NEW) - ARRAY['status','cancelled_by','cancelled_at','cancellation_reason','updated_at'])
           = (to_jsonb(OLD) - ARRAY['status','cancelled_by','cancelled_at','cancellation_reason','updated_at']) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'issued quote is immutable' USING ERRCODE='55000';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='quote_items' THEN
    SELECT status INTO quote_status FROM quotes WHERE id=COALESCE(NEW.quote_id, OLD.quote_id);
    IF quote_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'issued quote items are immutable' USING ERRCODE='55000';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'quote snapshots are append-only' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER quotes_protect
BEFORE UPDATE OR DELETE ON quotes
FOR EACH ROW EXECUTE FUNCTION protect_quote();
CREATE TRIGGER quote_items_protect
BEFORE UPDATE OR DELETE ON quote_items
FOR EACH ROW EXECUTE FUNCTION protect_quote();
CREATE TRIGGER quote_material_snapshots_append_only
BEFORE UPDATE OR DELETE ON quote_material_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
CREATE TRIGGER quote_pricing_component_snapshots_append_only
BEFORE UPDATE OR DELETE ON quote_pricing_component_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
