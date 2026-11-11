-- Keep the weekly plan and the work actually done as separate facts.
alter table public.production_allocations
  add column actual_date date,
  add column result_destination text check (result_destination in ('client', 'stock'));

alter table public.production_allocations
  drop constraint production_allocations_capacity_evidence_check,
  drop constraint production_allocations_completion_check;

alter table public.production_allocations
  add constraint production_allocations_capacity_evidence_check
    check (status <> 'confirmed' or (production_resource_id is not null and capacity_rule_id is not null)),
  add constraint production_allocations_completion_check
    check (status <> 'completed' or (actual_quantity is not null and actual_quantity >= 0 and completed_at is not null));

create or replace function public.guard_production_allocation_capacity_v1()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.production_resource_id is null and nullif(trim(new.resource_id), '') is not null then
    select id into new.production_resource_id
    from public.production_resources
    where active and (
      (new.resource_id = 'internal' and resource_type = 'internal_factory')
      or provider_id = new.resource_id
      or id::text = new.resource_id
    )
    order by display_order, id limit 1;
  end if;
  if new.status = 'confirmed' and (new.production_resource_id is null or new.capacity_rule_id is null) then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.note := concat_ws(', ', nullif(trim(new.note), ''), 'Pendiente de revisar capacidad');
    else
      raise exception 'La asignación necesita recurso y regla de capacidad para confirmarse.';
    end if;
  end if;
  if new.status = 'completed' and new.production_resource_id is null then
    raise exception 'Indique quién realizó la producción.';
  end if;
  return new;
end; $$;

-- A result can be entered directly from a planned draft. One allocation creates
-- at most one physical receipt; the unique ledger index prevents duplicates.
create function public.record_production_result_v1(
  p_allocation_id bigint,
  p_actual_quantity integer,
  p_actual_date date,
  p_destination text,
  p_note text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_allocation public.production_allocations%rowtype;
  v_product_id text;
  v_client_id text;
  v_requires_treatment boolean;
  v_resource_name text;
begin
  select * into v_allocation from public.production_allocations where id = p_allocation_id for update;
  if not found then raise exception 'Asignación no encontrada.'; end if;
  if v_allocation.status not in ('draft', 'confirmed') then
    raise exception 'Esta asignación ya tiene un resultado o fue cancelada.';
  end if;
  if v_allocation.production_resource_id is null then raise exception 'Indique quién realizó la producción.'; end if;
  if p_actual_quantity is null or p_actual_quantity < 0 then raise exception 'Indique una cantidad real válida.'; end if;
  if p_actual_date is null or p_actual_date > (now() at time zone 'America/Montevideo')::date then
    raise exception 'Indique una fecha real que no sea futura.';
  end if;
  if p_actual_quantity > 0 and (p_destination is null or p_destination not in ('client', 'stock')) then
    raise exception 'Indique si la producción va al cliente o a stock.';
  end if;

  select ol.product_id, cp.client_id, p.requires_treatment into v_product_id, v_client_id, v_requires_treatment
  from public.order_lines ol
  left join public.client_products cp on cp.id = ol.client_product_id
  join public.products p on p.id = ol.product_id
  where ol.id = v_allocation.order_line_id;
  if v_product_id is null then raise exception 'La línea no tiene un producto válido.'; end if;
  select name into v_resource_name from public.production_resources where id = v_allocation.production_resource_id;

  if p_actual_quantity > 0 then
    perform 1 from public.products where id = v_product_id for update;
    insert into public.stock_movements(
      product_id, stock_state, quantity, movement_type, production_allocation_id,
      transformation_id, performed_at, responsible, note, order_line_id, client_id
    ) values (
      v_product_id,
      case when v_requires_treatment then 'pending_treatment' else 'ready' end,
      p_actual_quantity, 'production_receipt', p_allocation_id,
      gen_random_uuid(), (p_actual_date + time '12:00') at time zone 'America/Montevideo',
      coalesce(v_resource_name, 'Producción'), nullif(trim(p_note), ''),
      case when p_destination = 'client' then v_allocation.order_line_id else null end,
      case when p_destination = 'client' then v_client_id else null end
    );
  end if;

  update public.production_allocations set
    actual_quantity = p_actual_quantity,
    actual_date = p_actual_date,
    result_destination = case when p_actual_quantity = 0 then null else p_destination end,
    completed_at = now(),
    completion_note = nullif(trim(p_note), ''),
    status = 'completed'
  where id = p_allocation_id;
  return true;
end; $$;

revoke execute on function public.record_production_result_v1(bigint,integer,date,text,text)
  from public, anon, authenticated;
grant execute on function public.record_production_result_v1(bigint,integer,date,text,text)
  to service_role;

-- A missed or stock-bound result does not fulfill the original order line.
-- Preserve the completed record while allowing its unmet quantity to be planned again.
create or replace function public.replace_production_allocations_v1(p_order_line_id text, p_allocations jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_line public.order_lines%rowtype;
  v_item jsonb;
  v_total integer := 0;
  v_fixed integer;
  v_legacy_resource text;
  v_production_resource bigint;
  v_old_distribution text;
  v_new_distribution text;
  v_change_id uuid;
begin
  select * into v_line from public.order_lines where id = p_order_line_id for update;
  if not found then raise exception 'Línea no encontrada.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'Formato de asignaciones inválido.'; end if;

  select coalesce(string_agg(to_char(planned_date, 'DD/MM/YYYY') || ': ' || planned_quantity || ' unidades, ' || coalesce(resource_id, 'Sin recurso'), ' | ' order by planned_date, id), 'Sin distribuir')
  into v_old_distribution
  from public.production_allocations
  where order_line_id = p_order_line_id and status = 'draft';

  select least(v_line.requested_quantity, coalesce(sum(
    case when status = 'completed' then
      case when result_destination = 'stock' then 0 else coalesce(actual_quantity, 0) end
    else planned_quantity end
  ), 0)) into v_fixed
  from public.production_allocations
  where order_line_id = p_order_line_id and status in ('confirmed', 'completed');

  for v_item in select * from jsonb_array_elements(p_allocations) loop
    if (v_item->>'plannedQuantity')::integer <= 0 then raise exception 'Las cantidades deben ser mayores a cero.'; end if;
    if coalesce(v_item->>'status', 'draft') <> 'draft' then raise exception 'Las asignaciones nuevas se guardan en borrador.'; end if;
    v_total := v_total + (v_item->>'plannedQuantity')::integer;
  end loop;
  if v_total + v_fixed > v_line.requested_quantity then raise exception 'La producción asignada supera la cantidad de la línea.'; end if;

  delete from public.production_allocations where order_line_id = p_order_line_id and status = 'draft';
  for v_item in select * from jsonb_array_elements(p_allocations) loop
    v_legacy_resource := nullif(trim(v_item->>'resourceId'), '');
    select id into v_production_resource
    from public.production_resources
    where active and (
      (v_legacy_resource = 'internal' and resource_type = 'internal_factory')
      or provider_id = v_legacy_resource
      or id::text = v_legacy_resource
    )
    order by display_order, id limit 1;
    insert into public.production_allocations(order_line_id, resource_id, production_resource_id, planned_date, planned_quantity, status, note)
    values (p_order_line_id, v_legacy_resource, v_production_resource, (v_item->>'plannedDate')::date,
      (v_item->>'plannedQuantity')::integer, 'draft', nullif(trim(v_item->>'note'), ''));
  end loop;

  select coalesce(string_agg(to_char(planned_date, 'DD/MM/YYYY') || ': ' || planned_quantity || ' unidades, ' || coalesce(resource_id, 'Sin recurso'), ' | ' order by planned_date, id), 'Sin distribuir')
  into v_new_distribution
  from public.production_allocations
  where order_line_id = p_order_line_id and status = 'draft';

  if v_old_distribution is distinct from v_new_distribution then
    insert into public.order_changes(order_id, kind, note)
    values (v_line.order_id, 'cambio', v_line.product || ': distribución de producción actualizada')
    returning id into v_change_id;
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Distribución de producción', v_old_distribution, v_new_distribution, 1);
  end if;
  return true;
end; $$;
