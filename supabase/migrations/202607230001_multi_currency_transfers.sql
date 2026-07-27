create table payment_routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_tr text not null,
  route_type text not null check (route_type in ('local_transfer','assisted')),
  currency char(3),
  account_holder text not null default '',
  bank_name text not null default '',
  account_label text not null default 'Account number',
  account_identifier text not null default '',
  contact_url text not null default '',
  customer_rate numeric(20,8),
  rounding_increment_minor integer not null default 1 check (rounding_increment_minor > 0),
  quote_minutes integer not null default 20 check (quote_minutes between 5 and 120),
  rate_valid_until timestamptz,
  is_enabled boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (route_type = 'assisted' and currency is null and contact_url <> '')
    or
    (route_type = 'local_transfer' and currency is not null)
  ),
  check (not is_enabled or currency = 'TRY' or customer_rate is not null or route_type = 'assisted')
);

create trigger touch_payment_routes before update on payment_routes
  for each row execute function touch_updated_at();

insert into payment_routes
  (code,name_en,name_tr,route_type,currency,account_label,sort_order,is_enabled)
values
  ('try-transfer','Turkish lira transfer','Türk lirası havalesi','local_transfer','TRY','IBAN',10,false),
  ('ngn-transfer','Naira transfer','Naira havalesi','local_transfer','NGN','Account number',20,false)
on conflict(code) do nothing;

create table payment_quotes (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references payment_routes(id) on delete restrict,
  base_amount_kurus integer not null check (base_amount_kurus >= 0),
  settlement_currency char(3) not null,
  settlement_amount_minor bigint not null check (settlement_amount_minor >= 0),
  customer_rate numeric(20,8) not null,
  route_snapshot jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_quotes_expiry_idx on payment_quotes(expires_at) where consumed_at is null;

alter table orders add column payment_route_id uuid references payment_routes(id) on delete restrict;
alter table orders add column settlement_currency char(3);
alter table orders add column settlement_amount_minor bigint;
alter table orders add column exchange_rate numeric(20,8);
alter table orders add column payment_account_snapshot jsonb;
alter table orders add column transfer_sender_name text;
alter table orders add column transfer_customer_reference text;
alter table orders add column transfer_reported_amount_minor bigint;
alter table orders add column transfer_mismatch_note text;

alter table payments add column settlement_currency char(3);
alter table payments add column settlement_amount_minor bigint;
alter table payments add column exchange_rate numeric(20,8);
alter table payments add column received_amount_minor bigint;

update orders set settlement_currency='TRY',settlement_amount_minor=total_kurus,exchange_rate=1
where payment_method='bank_transfer' and settlement_currency is null;
update payments set settlement_currency='TRY',settlement_amount_minor=amount_kurus,exchange_rate=1
where provider='bank_transfer' and settlement_currency is null;

comment on column payment_routes.customer_rate is
  'Customer settlement currency units per one TRY; set directly by the owner.';
comment on column orders.payment_account_snapshot is
  'Frozen public payment instructions; route edits must never alter an existing order.';
