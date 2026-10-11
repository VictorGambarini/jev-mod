CREATE TABLE coupons (
  code text PRIMARY KEY,
  percent_off integer NOT NULL,
  expires_at timestamptz
);
