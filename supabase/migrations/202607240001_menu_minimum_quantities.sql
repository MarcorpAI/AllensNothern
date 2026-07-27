alter table menu_items
  add column minimum_order_quantity integer not null default 1
  check (minimum_order_quantity between 1 and 25);

comment on column menu_items.minimum_order_quantity is
  'Minimum quantity for this specific menu item in one cart line; snack minimums cannot be mixed.';
