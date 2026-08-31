alter table public.transport_capacity_defaults
  add column if not exists trip_capacity integer
  check (trip_capacity is null or trip_capacity >= 0);

alter table public.capacity_daily_adjustments
  add column if not exists trip_adjustment integer not null default 0;

create or replace function public.upsert_transport_trip_capacity_v1(
  p_source text,
  p_provider_id text,
  p_trip_capacity integer,
  p_status text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_source not in ('internal', 'external') or p_trip_capacity < 0 or p_status not in ('estimated', 'confirmed') then
    raise exception 'Capacidad de viajes inválida.';
  end if;
  if p_source = 'external' and not exists (
    select 1 from public.providers where id = p_provider_id and type = 'Transporte'
  ) then
    raise exception 'Seleccione un transportista registrado.';
  end if;

  if p_source = 'internal' then
    insert into public.transport_capacity_defaults(source, provider_id, pallet_capacity, trip_capacity, status)
    values ('internal', null, 0, p_trip_capacity, 'confirmed')
    on conflict (source) where source = 'internal'
    do update set trip_capacity = excluded.trip_capacity, status = 'confirmed', updated_at = now()
    returning id into v_id;
  else
    insert into public.transport_capacity_defaults(source, provider_id, pallet_capacity, trip_capacity, status)
    values ('external', p_provider_id, 0, p_trip_capacity, p_status)
    on conflict (provider_id) where source = 'external'
    do update set trip_capacity = excluded.trip_capacity, status = excluded.status, updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.upsert_transport_trip_adjustment_v1(
  p_date date,
  p_source text,
  p_provider_id text,
  p_trip_adjustment integer,
  p_responsible text,
  p_status text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_responsible text := nullif(trim(coalesce(p_responsible, '')), '');
begin
  if p_date is null or p_source not in ('internal', 'external') or p_status not in ('estimated', 'confirmed') then
    raise exception 'Ajuste de cupos inválido.';
  end if;
  if p_source = 'internal' and p_provider_id is not null then
    raise exception 'El transporte interno no lleva proveedor.';
  end if;
  if p_source = 'external' and not exists (
    select 1 from public.providers where id = p_provider_id and type = 'Transporte'
  ) then
    raise exception 'Seleccione un transportista registrado.';
  end if;
  if p_trip_adjustment <> 0 and v_responsible is null then
    raise exception 'Indique quién registra el cambio de cupos.';
  end if;

  select id into v_id
  from public.capacity_daily_adjustments
  where adjustment_date = p_date
    and resource_type = 'transport'
    and operation is null
    and source = p_source
    and provider_id is not distinct from p_provider_id
  limit 1;

  if v_id is null and p_trip_adjustment = 0 then
    return null;
  elsif v_id is null then
    insert into public.capacity_daily_adjustments(
      adjustment_date, resource_type, operation, source, provider_id,
      pallet_adjustment, trip_adjustment, people_count, responsible, status
    ) values (
      p_date, 'transport', null, p_source, p_provider_id,
      0, p_trip_adjustment, null, v_responsible, case when p_source = 'internal' then 'confirmed' else p_status end
    ) returning id into v_id;
  else
    update public.capacity_daily_adjustments
    set trip_adjustment = p_trip_adjustment,
        responsible = case when p_trip_adjustment = 0 then responsible else v_responsible end,
        status = case when p_source = 'internal' then 'confirmed' else p_status end,
        updated_at = now()
    where id = v_id;

    if p_trip_adjustment = 0 and not exists (
      select 1 from public.capacity_daily_adjustments where id = v_id and pallet_adjustment <> 0
    ) then
      delete from public.capacity_daily_adjustments where id = v_id;
      return null;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_transport_trip_capacity_v1(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.upsert_transport_trip_adjustment_v1(date, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.upsert_transport_trip_capacity_v1(text, text, integer, text) to service_role;
grant execute on function public.upsert_transport_trip_adjustment_v1(date, text, text, integer, text, text) to service_role;

notify pgrst, 'reload schema';
