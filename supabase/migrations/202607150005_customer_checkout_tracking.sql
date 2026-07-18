alter table orders
  add column terms_accepted_at timestamptz,
  add column legal_version text;

comment on column orders.terms_accepted_at is
  'Checkout consent timestamp. Approved legal copy/version is supplied before launch.';
comment on column orders.legal_version is
  'Identifier for the terms/privacy text accepted at checkout.';
