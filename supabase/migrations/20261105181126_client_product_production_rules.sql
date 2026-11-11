-- Store future production rules for the client's own product, without changing
-- historical product-wide rules that may be attached to confirmed allocations.
alter table public.production_capacity_rules
  add column client_product_id bigint references public.client_products(id) on delete cascade;

create index production_capacity_rules_client_product_idx
  on public.production_capacity_rules(client_product_id, resource_id)
  where client_product_id is not null;

do $$
declare old_constraint text;
begin
  for old_constraint in
    select conname from pg_constraint
    where conrelid = 'public.production_capacity_rules'::regclass and contype = 'x'
  loop
    execute format('alter table public.production_capacity_rules drop constraint %I', old_constraint);
  end loop;
end $$;

alter table public.production_capacity_rules
  add constraint production_capacity_rules_client_scope_excl exclude using gist (
    resource_id with =,
    product_id with =,
    (coalesce(client_product_id, 0)) with =,
    (coalesce(people_count, 0)) with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  );

create or replace function public.check_production_rule_client_product_v1()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.client_product_id is not null and not exists (
    select 1 from public.client_products cp
    where cp.id = new.client_product_id and cp.product_id = new.product_id
  ) then
    raise exception 'El producto de la regla no pertenece al cliente seleccionado.';
  end if;
  return new;
end; $$;
revoke execute on function public.check_production_rule_client_product_v1() from public, anon, authenticated;

create trigger production_rule_client_product_guard
before insert or update on public.production_capacity_rules
for each row execute function public.check_production_rule_client_product_v1();

create or replace function public.check_confirmed_allocation_client_rule_v1()
returns trigger language plpgsql security invoker set search_path = public as $$
declare rule_client_product_id bigint; line_client_product_id bigint;
begin
  if new.status <> 'confirmed' then return new; end if;
  if new.capacity_rule_id is null or new.production_resource_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'confirmed' and old.capacity_rule_id is not distinct from new.capacity_rule_id then return new; end if;
  end if;
  select r.client_product_id into rule_client_product_id
  from public.production_capacity_rules r where r.id = new.capacity_rule_id;
  select ol.client_product_id into line_client_product_id
  from public.order_lines ol where ol.id = new.order_line_id;
  if rule_client_product_id is null or line_client_product_id is null or rule_client_product_id <> line_client_product_id then
    raise exception 'Seleccione una regla de rendimiento para el producto de este cliente.';
  end if;
  return new;
end; $$;
revoke execute on function public.check_confirmed_allocation_client_rule_v1() from public, anon, authenticated;

create trigger production_allocation_client_rule_guard
before insert or update on public.production_allocations
for each row execute function public.check_confirmed_allocation_client_rule_v1();
