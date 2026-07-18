alter table order_capacity_rules
  drop constraint order_capacity_rules_check,
  add constraint order_capacity_rules_scope_check
    check (weekday is null or target_date is null);

comment on table order_capacity_rules is
  'Every-day, recurring weekday, or one-off date order limits. Multiple non-overlapping time windows can define a day.';
