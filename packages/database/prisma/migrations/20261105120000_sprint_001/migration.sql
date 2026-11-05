CREATE TABLE installation (
  singleton_key boolean PRIMARY KEY DEFAULT true CHECK (singleton_key),
  id uuid NOT NULL UNIQUE,
  company_name varchar(160) NOT NULL,
  timezone varchar(80) NOT NULL,
  currency char(3) NOT NULL CHECK (currency = 'BRL'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  email_normalized varchar(254) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('MANAGER', 'EMPLOYEE')),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  created_by uuid REFERENCES users(id),
  disabled_by uuid REFERENCES users(id),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_hash char(64) NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  session_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sessions_user_active_idx ON sessions(user_id, revoked_at, expires_at);

CREATE TABLE materials (
  id uuid PRIMARY KEY,
  code varchar(40) NOT NULL,
  normalized_code varchar(40) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description varchar(1000),
  base_unit varchar(12) NOT NULL,
  minimum_stock numeric(18,6) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX materials_page_idx ON materials(normalized_code, id);

CREATE TABLE material_costs (
  id uuid PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES materials(id),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  effective_at timestamptz NOT NULL,
  reason varchar(500),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX material_costs_current_idx ON material_costs(material_id, effective_at DESC, created_at DESC, id DESC);

CREATE TABLE inventory_balances (
  material_id uuid PRIMARY KEY REFERENCES materials(id),
  physical_quantity numeric(18,6) NOT NULL DEFAULT 0,
  reserved_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES materials(id),
  type varchar(24) NOT NULL CHECK (type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
  quantity_delta numeric(18,6) NOT NULL CHECK (quantity_delta <> 0),
  reason varchar(500),
  source_type varchar(40),
  source_id uuid,
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  correlation_id varchar(100) NOT NULL,
  negative_stock_confirmed boolean NOT NULL DEFAULT false,
  resulting_physical numeric(18,6) NOT NULL,
  resulting_reserved numeric(18,6) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') OR length(trim(reason)) >= 3)
);
CREATE UNIQUE INDEX inventory_opening_once_idx ON inventory_movements(material_id) WHERE type = 'OPENING_BALANCE';
CREATE INDEX inventory_movements_page_idx ON inventory_movements(material_id, created_at DESC, id DESC);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  scope varchar(300) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  response_status integer NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(scope, idempotency_key)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_type varchar(24) NOT NULL CHECK (actor_type IN ('USER', 'SYSTEM', 'NORTH_ADMIN')),
  actor_id uuid REFERENCES users(id),
  action varchar(100) NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id uuid,
  correlation_id varchar(100) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_page_idx ON audit_events(occurred_at DESC, id DESC);
CREATE INDEX audit_events_resource_idx ON audit_events(resource_type, resource_id, occurred_at DESC);

CREATE FUNCTION prevent_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only relation % cannot be changed', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER inventory_movements_append_only
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();

