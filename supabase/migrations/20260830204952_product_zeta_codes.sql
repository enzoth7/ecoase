-- El Código Zeta es propiedad del catálogo de productos y se replica en cada
-- relación cliente-producto para preservar los pedidos históricos.
alter table public.products add column if not exists zeta_code text;

update public.products
set zeta_code = nullif(trim(source_code), '')
where nullif(trim(coalesce(zeta_code, '')), '') is null
  and nullif(trim(coalesce(source_code, '')), '') is not null;

update public.client_products client_product
set zeta_code = product.zeta_code
from public.products product
where product.id = client_product.product_id
  and client_product.zeta_code is distinct from product.zeta_code;

create or replace function public.set_client_product_zeta_from_catalog()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  select nullif(trim(zeta_code), '') into new.zeta_code
  from public.products
  where id = new.product_id;
  return new;
end; $$;

drop trigger if exists client_products_set_zeta_from_catalog on public.client_products;
create trigger client_products_set_zeta_from_catalog
before insert or update of product_id on public.client_products
for each row execute function public.set_client_product_zeta_from_catalog();

create or replace function public.sync_product_zeta_to_client_products()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.client_products
  set zeta_code = new.zeta_code
  where product_id = new.id
    and zeta_code is distinct from new.zeta_code;
  return new;
end; $$;

drop trigger if exists products_sync_zeta_to_client_products on public.products;
create trigger products_sync_zeta_to_client_products
after update of zeta_code on public.products
for each row
when (old.zeta_code is distinct from new.zeta_code)
execute function public.sync_product_zeta_to_client_products();

create or replace function public.create_catalog_product_v3(
  p_kind text,
  p_measure text,
  p_requires_treatment boolean,
  p_zeta_code text
) returns text language plpgsql security invoker set search_path = public as $$
declare v_id text; v_zeta_code text := nullif(trim(p_zeta_code), '');
begin
  if v_zeta_code is null then raise exception 'Indique el código Zeta.'; end if;
  v_id := public.create_catalog_product_v2(p_kind, p_measure, p_requires_treatment);
  update public.products set zeta_code = v_zeta_code where id = v_id;
  return v_id;
end; $$;

create or replace function public.create_client_product_master_v2(
  p_client_id text,
  p_product_id text,
  p_operational_name text,
  p_control_title text,
  p_control_detail text
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint; v_zeta_code text;
begin
  if not exists (select 1 from public.clients where id = p_client_id) then raise exception 'Cliente no encontrado.'; end if;
  select nullif(trim(zeta_code), '') into v_zeta_code from public.products where id = p_product_id;
  if not found then raise exception 'Producto no encontrado.'; end if;
  if v_zeta_code is null then raise exception 'El producto debe tener un código Zeta.'; end if;
  if nullif(trim(p_control_title), '') is null then raise exception 'Indique al menos un punto de control.'; end if;
  insert into public.client_products(client_id, product_id, zeta_code, operational_name, active)
  values (p_client_id, p_product_id, v_zeta_code, nullif(trim(p_operational_name), ''), false)
  returning id into v_id;
  insert into public.client_product_controls(client_product_id, title, detail, display_order)
  values (v_id, trim(p_control_title), nullif(trim(p_control_detail), ''), 0);
  return v_id;
end; $$;

create or replace function public.update_client_product_master_v2(
  p_id bigint,
  p_operational_name text,
  p_active boolean,
  p_display_order integer
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_client_id text; v_product_id text; v_zeta_code text;
begin
  select client_id, product_id into v_client_id, v_product_id from public.client_products where id = p_id for update;
  if not found then raise exception 'Relación cliente-producto no encontrada.'; end if;
  select nullif(trim(zeta_code), '') into v_zeta_code from public.products where id = v_product_id;
  if v_zeta_code is null then raise exception 'El producto debe tener un código Zeta.'; end if;
  if p_display_order < 0 then raise exception 'El orden no puede ser negativo.'; end if;
  if p_active and not exists (select 1 from public.clients where id = v_client_id and active and nullif(trim(address), '') is not null) then
    raise exception 'El cliente debe estar activo y tener dirección.';
  end if;
  if p_active and not exists (select 1 from public.client_product_controls where client_product_id = p_id and active) then
    raise exception 'Indique al menos un punto de control activo.';
  end if;
  if p_active and not exists (select 1 from public.client_product_assets where client_product_id = p_id and active and is_primary) then
    raise exception 'Cargue un plano o fotografía principal.';
  end if;
  update public.client_products
  set zeta_code = v_zeta_code,
      operational_name = nullif(trim(p_operational_name), ''),
      active = p_active,
      display_order = p_display_order
  where id = p_id;
  return true;
end; $$;

revoke execute on function public.create_catalog_product_v3(text,text,boolean,text) from public, anon, authenticated;
revoke execute on function public.create_client_product_master_v2(text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.update_client_product_master_v2(bigint,text,boolean,integer) from public, anon, authenticated;
grant execute on function public.create_catalog_product_v3(text,text,boolean,text) to service_role;
grant execute on function public.create_client_product_master_v2(text,text,text,text,text) to service_role;
grant execute on function public.update_client_product_master_v2(bigint,text,boolean,integer) to service_role;

notify pgrst, 'reload schema';
