ALTER TABLE customers
  ADD COLUMN billing_document_ciphertext bytea,
  ADD COLUMN billing_document_nonce bytea,
  ADD COLUMN billing_document_auth_tag bytea,
  ADD COLUMN billing_document_hash char(64),
  ADD COLUMN billing_document_last4 varchar(4),
  ADD CONSTRAINT customers_billing_document_complete CHECK (
    (billing_document_ciphertext IS NULL AND billing_document_nonce IS NULL AND
     billing_document_auth_tag IS NULL AND billing_document_hash IS NULL AND
     billing_document_last4 IS NULL)
    OR
    (billing_document_ciphertext IS NOT NULL AND billing_document_nonce IS NOT NULL AND
     billing_document_auth_tag IS NOT NULL AND billing_document_hash IS NOT NULL AND
     billing_document_last4 IS NOT NULL)
  );
CREATE UNIQUE INDEX customers_billing_document_hash_idx
  ON customers(billing_document_hash) WHERE billing_document_hash IS NOT NULL;

CREATE SEQUENCE order_commercial_number_seq START 1;

CREATE TABLE deposit_policies (
  id uuid PRIMARY KEY,
  version_number integer NOT NULL UNIQUE CHECK (version_number > 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED')),
  rate_bps integer NOT NULL CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  minimum_amount_cents bigint NOT NULL DEFAULT 0 CHECK (minimum_amount_cents >= 0),
  effective_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX deposit_policies_one_active_idx ON deposit_policies(status) WHERE status='ACTIVE';

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  commercial_number varchar(32) NOT NULL UNIQUE,
  quote_id uuid NOT NULL UNIQUE REFERENCES quotes(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  status varchar(40) NOT NULL CHECK (status IN
    ('PENDING_READINESS','READY_FOR_PRODUCTION','FINANCIAL_REVIEW','CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  quote_number_snapshot varchar(32) NOT NULL,
  customer_name_snapshot varchar(200) NOT NULL,
  total_amount_cents bigint NOT NULL CHECK (total_amount_cents >= 0),
  deposit_policy_id uuid NOT NULL REFERENCES deposit_policies(id),
  deposit_policy_version integer NOT NULL CHECK (deposit_policy_version > 0),
  deposit_rate_bps integer NOT NULL CHECK (deposit_rate_bps BETWEEN 0 AND 10000),
  deposit_amount_cents bigint NOT NULL CHECK (deposit_amount_cents >= 0),
  paid_amount_cents bigint NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
  current_artwork_version_id uuid,
  readiness_evaluated_at timestamptz,
  reserved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  cancelled_by uuid REFERENCES users(id),
  cancellation_reason varchar(500),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX orders_page_idx ON orders(created_at DESC,id DESC);
CREATE INDEX orders_status_idx ON orders(status,created_at DESC,id DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  quote_item_id uuid NOT NULL REFERENCES quote_items(id),
  display_order integer NOT NULL CHECK (display_order >= 0),
  product_code varchar(40) NOT NULL,
  product_name varchar(160) NOT NULL,
  variant_code varchar(40) NOT NULL,
  variant_name varchar(160) NOT NULL,
  technique_code varchar(40) NOT NULL,
  technique_name varchar(160) NOT NULL,
  requested_quantity numeric(18,6) NOT NULL CHECK (requested_quantity > 0),
  technical_sheet_id uuid NOT NULL REFERENCES technical_sheets(id),
  technical_sheet_version integer NOT NULL CHECK (technical_sheet_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(order_id,quote_item_id)
);

CREATE TABLE order_material_requirements (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  order_item_id uuid NOT NULL REFERENCES order_items(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  material_code varchar(40) NOT NULL,
  material_name varchar(160) NOT NULL,
  unit varchar(12) NOT NULL,
  required_quantity numeric(18,6) NOT NULL CHECK (required_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(order_item_id,material_id)
);
CREATE INDEX order_material_requirements_order_idx ON order_material_requirements(order_id,material_id);

CREATE TABLE order_state_history (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  from_status varchar(40),
  to_status varchar(40) NOT NULL,
  reason varchar(500),
  actor_type varchar(24) NOT NULL CHECK (actor_type IN ('USER','SYSTEM')),
  actor_id uuid REFERENCES users(id),
  correlation_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX order_state_history_order_idx ON order_state_history(order_id,created_at,id);

CREATE TABLE financial_decisions (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  type varchar(40) NOT NULL CHECK (type IN ('SIGNAL_EXCEPTION_APPROVED','PAYMENT_REVIEW_REQUIRED')),
  reason varchar(500) NOT NULL CHECK (length(trim(reason)) >= 3),
  amount_cents bigint,
  created_by uuid NOT NULL REFERENCES users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX financial_decisions_order_idx ON financial_decisions(order_id,created_at DESC);

CREATE TABLE asaas_connections (
  id uuid PRIMARY KEY,
  environment varchar(16) NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  api_key_ciphertext bytea NOT NULL,
  api_key_nonce bytea NOT NULL,
  api_key_auth_tag bytea NOT NULL,
  webhook_token_ciphertext bytea NOT NULL,
  webhook_token_nonce bytea NOT NULL,
  webhook_token_auth_tag bytea NOT NULL,
  webhook_public_url varchar(2048) NOT NULL,
  key_fingerprint char(12) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX asaas_connections_one_active_idx ON asaas_connections(status) WHERE status='ACTIVE';

CREATE TABLE asaas_customer_bindings (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  environment varchar(16) NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  external_customer_id varchar(80) NOT NULL,
  document_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(customer_id,environment),
  UNIQUE(environment,external_customer_id)
);

CREATE TABLE payment_charges (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  provider varchar(20) NOT NULL CHECK (provider='ASAAS'),
  environment varchar(16) NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  external_charge_id varchar(100),
  status varchar(40) NOT NULL CHECK (status IN
    ('PENDING_CREATION','CREATED','CONFIRMED','RECEIVED','OVERDUE','REFUNDED',
     'PARTIALLY_REFUNDED','CHARGEBACK','FAILED','CANCELLED')),
  billing_type varchar(24) NOT NULL CHECK (billing_type IN ('PIX','BOLETO','UNDEFINED')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  due_date date NOT NULL,
  invoice_url varchar(2048),
  pix_copy_paste varchar(2048),
  external_reference varchar(100) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(environment,external_charge_id),
  UNIQUE(order_id,external_reference)
);
CREATE INDEX payment_charges_order_idx ON payment_charges(order_id,created_at DESC);

CREATE TABLE integration_outbox (
  id uuid PRIMARY KEY,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('PENDING','PROCESSING','PROCESSED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_at timestamptz,
  locked_by varchar(100),
  processed_at timestamptz,
  last_error_code varchar(100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX integration_outbox_pending_idx ON integration_outbox(status,available_at,created_at);

CREATE TABLE asaas_webhook_inbox (
  id uuid PRIMARY KEY,
  external_event_id varchar(160) NOT NULL UNIQUE,
  event_type varchar(100) NOT NULL,
  external_charge_id varchar(100),
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  last_error_code varchar(100)
);
CREATE INDEX asaas_webhook_inbox_pending_idx ON asaas_webhook_inbox(status,received_at);

CREATE TABLE object_files (
  id uuid PRIMARY KEY,
  storage_key varchar(500) NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  sha256 char(64) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE artwork_versions (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  file_id uuid NOT NULL UNIQUE REFERENCES object_files(id),
  status varchar(24) NOT NULL CHECK (status IN ('PENDING_CUSTOMER','CUSTOMER_CONFIRMED','APPROVED','SUPERSEDED')),
  customer_confirmation_reference varchar(500),
  customer_confirmed_at timestamptz,
  customer_confirmed_by uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(order_id,version_number)
);
CREATE INDEX artwork_versions_order_idx ON artwork_versions(order_id,version_number DESC);
ALTER TABLE orders ADD CONSTRAINT orders_current_artwork_fk
  FOREIGN KEY (current_artwork_version_id) REFERENCES artwork_versions(id);

CREATE TABLE artwork_approvals (
  id uuid PRIMARY KEY,
  artwork_version_id uuid NOT NULL UNIQUE REFERENCES artwork_versions(id),
  customer_confirmation_reference varchar(500) NOT NULL,
  approved_by uuid NOT NULL REFERENCES users(id),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  required_quantity numeric(18,6) NOT NULL CHECK (required_quantity > 0),
  reserved_quantity numeric(18,6) NOT NULL CHECK (reserved_quantity >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','RELEASED')),
  exception_confirmed boolean NOT NULL DEFAULT false,
  exception_reason varchar(500),
  created_by uuid NOT NULL REFERENCES users(id),
  released_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at timestamptz,
  UNIQUE(order_id,material_id)
);

CREATE TABLE inventory_reservation_alerts (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  required_quantity numeric(18,6) NOT NULL,
  available_quantity numeric(18,6) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('OPEN','OVERRIDDEN','RESOLVED')),
  reason varchar(500),
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz
);
CREATE INDEX inventory_reservation_alerts_order_idx ON inventory_reservation_alerts(order_id,status);

ALTER TABLE inventory_movements
  ADD COLUMN reserved_quantity_delta numeric(18,6) NOT NULL DEFAULT 0;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_type_check;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_quantity_delta_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_type_check CHECK
  (type IN ('OPENING_BALANCE','RECEIPT','ADJUSTMENT_IN','ADJUSTMENT_OUT','RESERVATION','RELEASE'));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_delta_check CHECK
  (quantity_delta <> 0 OR reserved_quantity_delta <> 0);
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reservation_shape CHECK (
  (type IN ('RESERVATION','RELEASE') AND quantity_delta = 0 AND reserved_quantity_delta <> 0)
  OR
  (type NOT IN ('RESERVATION','RELEASE') AND reserved_quantity_delta = 0)
);

CREATE TRIGGER order_state_history_append_only
BEFORE UPDATE OR DELETE ON order_state_history
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
CREATE TRIGGER financial_decisions_append_only
BEFORE UPDATE OR DELETE ON financial_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
CREATE TRIGGER artwork_approvals_append_only
BEFORE UPDATE OR DELETE ON artwork_approvals
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
