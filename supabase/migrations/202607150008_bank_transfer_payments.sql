alter table orders add column payment_method text;
update orders set payment_method = 'iyzico';
alter table orders alter column payment_method set default 'bank_transfer';
alter table orders alter column payment_method set not null;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('bank_transfer', 'iyzico'));

alter table orders add column payment_expires_at timestamptz;
update orders set payment_expires_at = capacity_reserved_until
  where payment_status = 'pending';
alter table orders add column transfer_notified_at timestamptz;
alter table orders add column payment_confirmed_by text;
alter table orders add column payment_confirmation_reference text;

alter table payments drop constraint if exists payments_provider_check;
alter table payments add constraint payments_provider_check
  check (provider in ('bank_transfer', 'iyzico'));

create index orders_pending_bank_transfer_idx
  on orders (payment_expires_at, transfer_notified_at, created_at)
  where payment_method = 'bank_transfer' and payment_status = 'pending';

comment on column orders.transfer_notified_at is
  'Customer acknowledgement that a bank transfer was submitted; never proof of payment.';
comment on column orders.payment_confirmed_by is
  'Administrator identity that verified funds in the receiving bank account.';
