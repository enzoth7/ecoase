alter table public.clients
  add column address text,
  add column department text;

drop function if exists public.create_operation_client(text);

create function public.create_operation_client(
  p_name text,
  p_address text default null,
  p_department text default null
) returns text
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

  insert into public.clients (id, name, address, department)
  values (
    'cliente-' || left(md5(lower(trim(p_name))), 12),
    trim(p_name),
    nullif(trim(p_address), ''),
    nullif(trim(p_department), '')
  )
  on conflict (name) do update set
    address = coalesce(nullif(trim(excluded.address), ''), public.clients.address),
    department = coalesce(nullif(trim(excluded.department), ''), public.clients.department)
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.create_operation_client(text, text, text) from public;
grant execute on function public.create_operation_client(text, text, text) to anon, authenticated;
