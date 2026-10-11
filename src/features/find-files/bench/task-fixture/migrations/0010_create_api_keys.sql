CREATE TABLE api_keys (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
