create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users(id, full_name, email, phone, deleted_at, updated_at)
  values (
    new.id::text,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'username'),
    new.email,
    new.phone,
    null,
    now()
  )
  on conflict(id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    deleted_at = null,
    updated_at = now();
  return new;
end;
$$;

create or replace function public.anonymize_deleted_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.users set
    full_name = null,
    email = null,
    phone = null,
    deleted_at = now(),
    updated_at = now()
  where id = old.id::text;
  return old;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.sync_auth_user_profile();

create trigger on_auth_user_updated
  after update of email, phone, raw_user_meta_data on auth.users
  for each row execute procedure public.sync_auth_user_profile();

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute procedure public.anonymize_deleted_auth_user();

drop policy "admin categories" on public.categories;
drop policy "admin items" on public.menu_items;
drop policy "admin modifiers" on public.modifiers;
drop policy "admin modifier options" on public.modifier_options;
drop policy "admin zones" on public.delivery_zones;
drop policy "admin orders" on public.orders;
drop policy "admin order items" on public.order_items;
drop policy "admin menu images" on storage.objects;

create policy "admin categories" on public.categories for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin items" on public.menu_items for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin modifiers" on public.modifiers for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin modifier options" on public.modifier_options for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin zones" on public.delivery_zones for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin orders" on public.orders for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin order items" on public.order_items for all using ((select auth.jwt()->'app_metadata'->>'app_role')='admin') with check ((select auth.jwt()->'app_metadata'->>'app_role')='admin');
create policy "admin menu images" on storage.objects for all
using (bucket_id='menu-images' and (select auth.jwt()->'app_metadata'->>'app_role')='admin')
with check (bucket_id='menu-images' and (select auth.jwt()->'app_metadata'->>'app_role')='admin');
