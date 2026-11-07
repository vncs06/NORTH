-- Sprint 003 R1: completes deposit modes, Asaas fees/lifecycle and artwork workflow.
ALTER TABLE deposit_policies
  ADD COLUMN mode varchar(24) NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN fixed_amount_cents bigint,
  ADD COLUMN allow_above_total boolean NOT NULL DEFAULT false;
ALTER TABLE deposit_policies ALTER COLUMN rate_bps DROP NOT NULL;
ALTER TABLE deposit_policies ALTER COLUMN minimum_amount_cents DROP NOT NULL;
ALTER TABLE deposit_policies DROP CONSTRAINT deposit_policies_rate_bps_check;
ALTER TABLE deposit_policies ADD CONSTRAINT deposit_policies_mode_check CHECK (
  (mode='PERCENTAGE' AND rate_bps BETWEEN 0 AND 10000 AND fixed_amount_cents IS NULL)
  OR
  (mode='FIXED_AMOUNT' AND rate_bps IS NULL AND fixed_amount_cents >= 0 AND minimum_amount_cents IS NULL)
);

ALTER TABLE orders
  ADD COLUMN deposit_mode varchar(24) NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN deposit_fixed_amount_cents bigint,
  ADD COLUMN deposit_allow_above_total boolean NOT NULL DEFAULT false;
ALTER TABLE orders ALTER COLUMN deposit_rate_bps DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_deposit_rate_bps_check;
ALTER TABLE orders ADD CONSTRAINT orders_deposit_snapshot_check CHECK (
  (deposit_mode='PERCENTAGE' AND deposit_rate_bps BETWEEN 0 AND 10000 AND deposit_fixed_amount_cents IS NULL)
  OR
  (deposit_mode='FIXED_AMOUNT' AND deposit_rate_bps IS NULL AND deposit_fixed_amount_cents >= 0)
);

ALTER TABLE asaas_connections DROP CONSTRAINT asaas_connections_status_check;
DROP INDEX asaas_connections_one_active_idx;
UPDATE asaas_connections SET status=CASE status WHEN 'ACTIVE' THEN 'CONNECTED' ELSE 'DISCONNECTED' END;
ALTER TABLE asaas_connections
  ALTER COLUMN status TYPE varchar(24),
  ALTER COLUMN api_key_ciphertext DROP NOT NULL,
  ALTER COLUMN api_key_nonce DROP NOT NULL,
  ALTER COLUMN api_key_auth_tag DROP NOT NULL,
  ALTER COLUMN webhook_token_ciphertext DROP NOT NULL,
  ALTER COLUMN webhook_token_nonce DROP NOT NULL,
  ALTER COLUMN webhook_token_auth_tag DROP NOT NULL,
  ADD COLUMN external_webhook_id varchar(100),
  ADD COLUMN last_validated_at timestamptz,
  ADD COLUMN disconnected_at timestamptz,
  ADD COLUMN last_error_code varchar(100),
  ADD CONSTRAINT asaas_connections_status_check CHECK (
    status IN ('CONNECTED','ROTATION_PENDING','DISCONNECT_PENDING','DISCONNECTED','ERROR')
  ),
  ADD CONSTRAINT asaas_connections_secret_state_check CHECK (
    (status='DISCONNECTED' AND api_key_ciphertext IS NULL AND api_key_nonce IS NULL AND api_key_auth_tag IS NULL)
    OR
    (status<>'DISCONNECTED' AND api_key_ciphertext IS NOT NULL AND api_key_nonce IS NOT NULL AND api_key_auth_tag IS NOT NULL)
  );
CREATE UNIQUE INDEX asaas_connections_one_connected_idx
  ON asaas_connections((true)) WHERE status IN ('CONNECTED','ROTATION_PENDING','DISCONNECT_PENDING');

CREATE TABLE asaas_fee_snapshots (
  id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES asaas_connections(id),
  environment varchar(16) NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  status varchar(16) NOT NULL CHECK (status IN ('NOT_FETCHED','AVAILABLE','STALE','FAILED')),
  fetched_at timestamptz,
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code varchar(100),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='AVAILABLE' AND fetched_at IS NOT NULL AND error_code IS NULL) OR status<>'AVAILABLE')
);
CREATE INDEX asaas_fee_snapshots_connection_idx
  ON asaas_fee_snapshots(connection_id,created_at DESC);

CREATE TABLE asaas_fee_items (
  id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES asaas_fee_snapshots(id),
  billing_type varchar(24) NOT NULL CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD')),
  fixed_fee_cents bigint NOT NULL DEFAULT 0 CHECK (fixed_fee_cents >= 0),
  percentage_bps integer NOT NULL DEFAULT 0 CHECK (percentage_bps BETWEEN 0 AND 10000),
  settlement_days integer CHECK (settlement_days IS NULL OR settlement_days >= 0),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(snapshot_id,billing_type)
);

CREATE TABLE payment_fee_policies (
  id uuid PRIMARY KEY,
  version_number integer NOT NULL UNIQUE CHECK (version_number > 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED')),
  fee_snapshot_id uuid NOT NULL REFERENCES asaas_fee_snapshots(id),
  effective_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX payment_fee_policies_one_active_idx
  ON payment_fee_policies((true)) WHERE status='ACTIVE';

CREATE TABLE payment_fee_policy_methods (
  id uuid PRIMARY KEY,
  policy_id uuid NOT NULL REFERENCES payment_fee_policies(id),
  billing_type varchar(24) NOT NULL CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD')),
  strategy varchar(20) NOT NULL CHECK (strategy IN ('ABSORB','PASS_THROUGH')),
  UNIQUE(policy_id,billing_type)
);

CREATE TABLE quote_payment_fee_snapshots (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES quotes(id),
  fee_policy_id uuid NOT NULL REFERENCES payment_fee_policies(id),
  fee_policy_version integer NOT NULL CHECK (fee_policy_version > 0),
  fee_snapshot_id uuid NOT NULL REFERENCES asaas_fee_snapshots(id),
  billing_type varchar(24) NOT NULL CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD')),
  strategy varchar(20) NOT NULL CHECK (strategy IN ('ABSORB','PASS_THROUGH')),
  base_amount_cents bigint NOT NULL CHECK (base_amount_cents >= 0),
  fixed_fee_cents bigint NOT NULL CHECK (fixed_fee_cents >= 0),
  percentage_bps integer NOT NULL CHECK (percentage_bps BETWEEN 0 AND 10000),
  estimated_fee_cents bigint NOT NULL CHECK (estimated_fee_cents >= 0),
  charged_amount_cents bigint NOT NULL CHECK (charged_amount_cents >= 0),
  estimated_net_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(quote_id,billing_type)
);

ALTER TABLE payment_charges DROP CONSTRAINT payment_charges_billing_type_check;
ALTER TABLE payment_charges ADD CONSTRAINT payment_charges_billing_type_check
  CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD'));
ALTER TABLE payment_charges
  ADD COLUMN fee_policy_id uuid REFERENCES payment_fee_policies(id),
  ADD COLUMN fee_policy_version integer,
  ADD COLUMN fee_snapshot_id uuid REFERENCES asaas_fee_snapshots(id),
  ADD COLUMN fee_strategy varchar(20) CHECK (fee_strategy IN ('ABSORB','PASS_THROUGH')),
  ADD COLUMN estimated_fee_cents bigint CHECK (estimated_fee_cents IS NULL OR estimated_fee_cents >= 0),
  ADD COLUMN estimated_net_cents bigint,
  ADD COLUMN provider_last_event_at timestamptz;
CREATE UNIQUE INDEX payment_charges_one_obligation_idx
  ON payment_charges(order_id) WHERE status<>'CANCELLED';

ALTER TABLE artwork_versions DROP CONSTRAINT artwork_versions_status_check;
ALTER TABLE artwork_versions ALTER COLUMN status TYPE varchar(40);
UPDATE artwork_versions SET status='DRAFT' WHERE status='PENDING_CUSTOMER';
ALTER TABLE artwork_versions
  ADD COLUMN approval_requested_at timestamptz,
  ADD COLUMN approval_requested_by uuid REFERENCES users(id),
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejected_by uuid REFERENCES users(id),
  ADD COLUMN rejection_reason varchar(500),
  ADD COLUMN rejection_confirmation_source varchar(200),
  ADD CONSTRAINT artwork_versions_status_check CHECK (
    status IN ('DRAFT','AWAITING_CUSTOMER_APPROVAL','CUSTOMER_CONFIRMED','APPROVED','REJECTED','SUPERSEDED')
  ),
  ADD CONSTRAINT artwork_versions_rejection_check CHECK (
    (rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL AND rejection_confirmation_source IS NULL)
    OR
    (status IN ('REJECTED','SUPERSEDED') AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND length(trim(rejection_reason)) >= 3 AND length(trim(rejection_confirmation_source)) >= 3)
  );

CREATE TABLE asaas_connection_operations (
  id uuid PRIMARY KEY,
  connection_id uuid REFERENCES asaas_connections(id),
  operation varchar(24) NOT NULL CHECK (operation IN ('CONNECT','ROTATE','DISCONNECT')),
  result varchar(16) NOT NULL CHECK (result IN ('STARTED','SUCCEEDED','FAILED','BLOCKED')),
  key_fingerprint char(12),
  environment varchar(16) NOT NULL,
  error_code varchar(100),
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX asaas_connection_operations_idx
  ON asaas_connection_operations(created_at DESC);
