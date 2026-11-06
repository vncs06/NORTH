CREATE TABLE discount_policy_options (
  id uuid PRIMARY KEY,
  discount_policy_id uuid NOT NULL REFERENCES discount_policies(id),
  discount_bps integer NOT NULL CHECK (discount_bps BETWEEN 0 AND 10000),
  display_order integer NOT NULL CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(discount_policy_id, discount_bps),
  UNIQUE(discount_policy_id, display_order)
);

CREATE INDEX discount_policy_options_policy_idx
ON discount_policy_options(discount_policy_id, display_order, id);

CREATE TRIGGER discount_policy_options_append_only
BEFORE UPDATE OR DELETE ON discount_policy_options
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
