-- Sprint 003 R2: autonomous per-installation Asaas onboarding.
ALTER TABLE asaas_connections DROP CONSTRAINT asaas_connections_status_check;
ALTER TABLE asaas_connections DROP CONSTRAINT asaas_connections_secret_state_check;
DROP INDEX asaas_connections_one_connected_idx;

UPDATE asaas_connections
SET status = CASE status
  WHEN 'CONNECTED' THEN 'CONFIGURING'
  WHEN 'ROTATION_PENDING' THEN 'VALIDATING'
  WHEN 'DISCONNECT_PENDING' THEN 'DISCONNECTING'
  WHEN 'ERROR' THEN 'DEGRADED'
  ELSE status
END;

ALTER TABLE asaas_connections
  ADD COLUMN notification_email_ciphertext bytea,
  ADD COLUMN notification_email_nonce bytea,
  ADD COLUMN notification_email_auth_tag bytea,
  ADD COLUMN notification_email_masked varchar(320),
  ADD COLUMN webhook_send_type varchar(24) NOT NULL DEFAULT 'SEQUENTIALLY',
  ADD COLUMN webhook_api_version integer NOT NULL DEFAULT 3,
  ADD COLUMN webhook_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN webhook_status varchar(24) NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN last_success_at timestamptz,
  ADD COLUMN last_failure_category varchar(100),
  ADD COLUMN last_event_received_at timestamptz,
  ADD CONSTRAINT asaas_connections_status_check CHECK (
    status IN ('CONFIGURING','VALIDATING','ACTIVE','DEGRADED','DISCONNECTING','DISCONNECTED')
  ),
  ADD CONSTRAINT asaas_connections_webhook_contract_check CHECK (
    webhook_send_type='SEQUENTIALLY'
    AND webhook_api_version=3
    AND jsonb_typeof(webhook_events)='array'
  ),
  ADD CONSTRAINT asaas_connections_secret_state_check CHECK (
    (status='DISCONNECTED'
      AND api_key_ciphertext IS NULL AND api_key_nonce IS NULL AND api_key_auth_tag IS NULL
      AND webhook_token_ciphertext IS NULL AND webhook_token_nonce IS NULL AND webhook_token_auth_tag IS NULL)
    OR
    (status<>'DISCONNECTED'
      AND api_key_ciphertext IS NOT NULL AND api_key_nonce IS NOT NULL AND api_key_auth_tag IS NOT NULL
      AND webhook_token_ciphertext IS NOT NULL AND webhook_token_nonce IS NOT NULL AND webhook_token_auth_tag IS NOT NULL)
  ),
  ADD CONSTRAINT asaas_connections_active_complete_check CHECK (
    status<>'ACTIVE' OR (
      notification_email_ciphertext IS NOT NULL
      AND notification_email_nonce IS NOT NULL
      AND notification_email_auth_tag IS NOT NULL
      AND notification_email_masked IS NOT NULL
      AND external_webhook_id IS NOT NULL
      AND last_validated_at IS NOT NULL
      AND jsonb_array_length(webhook_events)>0
      AND webhook_status='ACTIVE'
    )
  );

CREATE UNIQUE INDEX asaas_connections_one_current_idx
  ON asaas_connections((true))
  WHERE status IN ('CONFIGURING','VALIDATING','ACTIVE','DEGRADED','DISCONNECTING');

CREATE TABLE asaas_payment_methods (
  id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES asaas_connections(id),
  billing_type varchar(24) NOT NULL CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD')),
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(connection_id,billing_type)
);

CREATE INDEX asaas_payment_methods_connection_idx
  ON asaas_payment_methods(connection_id,billing_type);
