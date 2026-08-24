alter table public.capacity_daily_adjustments
  add column if not exists people_count integer check (people_count is null or people_count >= 0);

drop function if exists public.upsert_capacity_daily_adjustment(date, text, text, text, text, integer, text, text);

create function public.upsert_capacity_daily_adjustment(
  p_date date,
  p_resource_type text,
  p_operation text default null,
  p_source text default null,
  p_provider_id text default null,
  p_pallet_adjustment integer default 0,
  p_people_count integer default null,
  p_responsible text default null,
  p_status text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_responsible text := nullif(trim(coalesce(p_responsible, '')), '');
  v_status text := coalesce(p_status, 'confirmed');
begin
  if p_date is null or p_resource_type not in ('internal_production', 'external_production', 'transport') then raise exception 'Asignación diaria inválida.'; end if;
  if p_resource_type = 'internal_production' and (p_operation not in ('assembly', 'marking', 'ht') or p_source is not null or p_provider_id is not null or p_people_count is null or p_people_count < 0) then raise exception 'Indique las personas asignadas a esta operación.'; end if;
  if p_resource_type = 'external_production' and (p_operation not in ('assembly', 'marking', 'ht') or p_source is not null or p_people_count is not null or not exists (select 1 from public.providers where id = p_provider_id and type = 'Aserradero')) then raise exception 'Seleccione un aserradero registrado.'; end if;
  if p_resource_type = 'transport' and (p_operation is not null or p_people_count is not null or p_source not in ('internal', 'external') or (p_source = 'internal' and p_provider_id is not null) or (p_source = 'external' and not exists (select 1 from public.providers where id = p_provider_id and type = 'Transporte'))) then raise exception 'Seleccione un transporte registrado.'; end if;
  if v_status not in ('estimated', 'confirmed') then raise exception 'Estado de capacidad inválido.'; end if;
  if p_resource_type <> 'internal_production' and p_pallet_adjustment <> 0 and v_responsible is null then raise exception 'Indique quién aporta la capacidad para este día.'; end if;

  delete from public.capacity_daily_adjustments
  where adjustment_date = p_date and resource_type = p_resource_type
    and operation is not distinct from p_operation
    and source is not distinct from p_source
    and provider_id is not distinct from p_provider_id;

  if p_pallet_adjustment = 0 and (p_resource_type <> 'internal_production' or p_people_count = 0) then return null; end if;

  insert into public.capacity_daily_adjustments(adjustment_date, resource_type, operation, source, provider_id, pallet_adjustment, people_count, responsible, status)
  values (p_date, p_resource_type, p_operation, p_source, p_provider_id, p_pallet_adjustment, p_people_count, v_responsible, v_status)
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.upsert_capacity_daily_adjustment(date, text, text, text, text, integer, integer, text, text) from public;
grant execute on function public.upsert_capacity_daily_adjustment(date, text, text, text, text, integer, integer, text, text) to anon, authenticated;
