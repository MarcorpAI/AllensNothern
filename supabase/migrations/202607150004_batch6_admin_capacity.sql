create table order_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  weekday smallint check (weekday between 0 and 6),
  target_date date,
  starts_at time,
  ends_at time,
  max_orders integer not null check (max_orders between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((weekday is null) <> (target_date is null)),
  check ((starts_at is null and ends_at is null) or
         (starts_at is not null and ends_at is not null and starts_at < ends_at))
);

comment on table order_capacity_rules is
  'Recurring weekday or one-off date limits. All matching all-day/time-window rules apply.';

alter table orders
  add column capacity_reserved_until timestamptz;

create index orders_capacity_idx on orders (created_at, payment_status, capacity_reserved_until);
create index order_capacity_rules_match_idx
  on order_capacity_rules (is_active, target_date, weekday, starts_at, ends_at);

create trigger touch_order_capacity_rules before update on order_capacity_rules
for each row execute function touch_updated_at();

alter table order_capacity_rules enable row level security;
create policy "admin order capacity rules" on order_capacity_rules for all
using ((select auth.jwt()->'app_metadata'->>'app_role')='admin')
with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
