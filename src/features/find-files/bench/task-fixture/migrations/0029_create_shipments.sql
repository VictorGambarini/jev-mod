CREATE TABLE shipments (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  carrier text NOT NULL,
  tracking text
);
