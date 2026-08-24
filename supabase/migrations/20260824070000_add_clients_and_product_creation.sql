create table public.clients (
  id text primary key,
  name text not null unique
);

insert into public.clients (id, name)
select 'cliente-' || left(md5(lower(client)), 12), client
from public.orders
group by client
on conflict (name) do nothing;

alter table public.clients enable row level security;
create policy clients_public_read on public.clients for select to anon, authenticated using (true);
grant select on public.clients to anon, authenticated;

create function public.create_operation_client(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id text;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Indique el nombre del cliente.';
  end if;

  insert into public.clients (id, name)
  values ('cliente-' || left(md5(lower(trim(p_name))), 12), trim(p_name))
  on conflict (name) do update set name = excluded.name
  returning id into created_id;

  return created_id;
end;
$$;

create function public.create_catalog_product(
  p_kind text,
  p_measure text default null,
  p_treatment text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id text;
  v_measure text := nullif(trim(p_measure), '');
begin
  if p_kind not in ('Pallet', 'Piso', 'Bin') then
    raise exception 'El tipo indicado no es válido.';
  end if;
  if p_treatment is not null and p_treatment not in ('Marcado', 'HT', 'Marcado y HT') then
    raise exception 'El tratamiento indicado no es válido.';
  end if;
  if exists (select 1 from public.products where kind = p_kind and measure is not distinct from v_measure) then
    raise exception 'Ya existe un producto con ese tipo y medida.';
  end if;

  created_id := 'producto-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  insert into public.products (id, kind, measure, treatment)
  values (created_id, p_kind, v_measure, p_treatment);
  return created_id;
end;
$$;

revoke all on function public.create_operation_client(text) from public;
revoke all on function public.create_catalog_product(text, text, text) from public;
grant execute on function public.create_operation_client(text) to anon, authenticated;
grant execute on function public.create_catalog_product(text, text, text) to anon, authenticated;
