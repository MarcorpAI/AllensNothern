create extension if not exists pgcrypto;
create extension if not exists postgis;

create sequence if not exists order_number_seq;

create type fulfillment_status as enum ('pending_payment','received','preparing','out_for_delivery','delivered');
create type payment_status as enum ('pending','paid','failed');

create table users (
  id text primary key,
  full_name text,
  email text,
  phone text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table restaurant_settings (
  id boolean primary key default true check (id),
  name text not null default 'AllensNothern',
  timezone text not null default 'Europe/Istanbul',
  is_temporarily_closed boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into restaurant_settings default values;

create table operating_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  unique (weekday, opens_at)
);

create table restaurant_closures (
  id uuid primary key default gen_random_uuid(),
  closure_date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area geography(Polygon, 4326) not null,
  delivery_fee_kurus integer not null check (delivery_fee_kurus >= 0),
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index delivery_zones_area_idx on delivery_zones using gist(area);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_tr text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  name_en text not null,
  name_tr text not null,
  description_en text not null default '',
  description_tr text not null default '',
  price_kurus integer not null check (price_kurus >= 0),
  image_url text,
  is_available boolean not null default true,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_category_idx on menu_items(category_id, sort_order);

create table modifiers (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name_en text not null,
  name_tr text not null,
  is_required boolean not null default false,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= min_select),
  sort_order integer not null default 0
);

create table modifier_options (
  id uuid primary key default gen_random_uuid(),
  modifier_id uuid not null references modifiers(id) on delete cascade,
  name_en text not null,
  name_tr text not null,
  price_delta_kurus integer not null default 0,
  sort_order integer not null default 0
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  label text not null,
  full_address text not null,
  instructions text not null default '',
  location geography(Point, 4326) not null,
  delivery_zone_id uuid references delivery_zones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('AN-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  user_id text references users(id) on delete set null,
  status fulfillment_status not null default 'pending_payment',
  payment_status payment_status not null default 'pending',
  locale text not null default 'en' check (locale in ('en','tr')),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  address_text text not null,
  address_instructions text not null default '',
  delivery_location geography(Point, 4326) not null,
  delivery_zone_id uuid references delivery_zones(id) on delete set null,
  delivery_zone_name text not null,
  subtotal_kurus integer not null check (subtotal_kurus >= 0),
  delivery_fee_kurus integer not null check (delivery_fee_kurus >= 0),
  total_kurus integer not null check (total_kurus = subtotal_kurus + delivery_fee_kurus),
  tracking_token_hash text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on orders(user_id, created_at desc);
create index orders_queue_idx on orders(status, created_at) where payment_status = 'paid';

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  item_name_en text not null,
  item_name_tr text not null,
  quantity integer not null check (quantity > 0),
  unit_price_kurus integer not null check (unit_price_kurus >= 0),
  selected_modifiers jsonb not null default '[]',
  line_total_kurus integer not null check (line_total_kurus = quantity * unit_price_kurus)
);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status fulfillment_status not null,
  changed_by text,
  changed_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  provider text not null check (provider = 'iyzico'),
  provider_reference text,
  provider_payment_id text,
  amount_kurus integer not null,
  status payment_status not null default 'pending',
  raw_response jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on payments(order_id);

create table webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  kind text not null,
  recipient text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  unique(order_id, kind)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  key text not null,
  endpoint text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key(key, endpoint)
);

create or replace function is_restaurant_open(at_time timestamptz) returns boolean
language sql stable as $$
  select not rs.is_temporarily_closed
    and not exists (select 1 from restaurant_closures rc where rc.closure_date = (at_time at time zone rs.timezone)::date)
    and exists (
      select 1 from operating_hours oh
      where oh.weekday = extract(dow from at_time at time zone rs.timezone)::smallint
        and (at_time at time zone rs.timezone)::time >= oh.opens_at
        and (at_time at time zone rs.timezone)::time < oh.closes_at
    )
  from restaurant_settings rs where rs.id;
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger touch_menu_items before update on menu_items for each row execute function touch_updated_at();
create trigger touch_categories before update on categories for each row execute function touch_updated_at();
create trigger touch_delivery_zones before update on delivery_zones for each row execute function touch_updated_at();
create trigger touch_orders before update on orders for each row execute function touch_updated_at();

alter table users enable row level security;
alter table addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table modifiers enable row level security;
alter table modifier_options enable row level security;
alter table delivery_zones enable row level security;

create policy "public categories" on categories for select using (is_active);
create policy "public items" on menu_items for select using (is_published);
create policy "public modifiers" on modifiers for select using (true);
create policy "public modifier options" on modifier_options for select using (true);
create policy "own profile" on users for select using (id = (select auth.jwt()->>'sub'));
create policy "own addresses" on addresses for all using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));
create policy "own orders" on orders for select using (user_id = (select auth.jwt()->>'sub'));
create policy "own order items" on order_items for select using (
  exists(select 1 from orders where orders.id=order_items.order_id and orders.user_id=(select auth.jwt()->>'sub'))
);

create policy "admin categories" on categories for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');
create policy "admin items" on menu_items for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');
create policy "admin modifiers" on modifiers for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');
create policy "admin modifier options" on modifier_options for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');
create policy "admin zones" on delivery_zones for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');
create policy "admin orders" on orders for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');
create policy "admin order items" on order_items for all using ((select auth.jwt()->>'app_role')='admin') with check ((select auth.jwt()->>'app_role')='admin');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('menu-images','menu-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "public menu images" on storage.objects for select using (bucket_id='menu-images');
create policy "admin menu images" on storage.objects for all
using (bucket_id='menu-images' and (select auth.jwt()->>'app_role')='admin')
with check (bucket_id='menu-images' and (select auth.jwt()->>'app_role')='admin');

alter publication supabase_realtime add table orders, menu_items;

