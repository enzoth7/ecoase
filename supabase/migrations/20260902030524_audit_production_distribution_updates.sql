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

  select coalesce(string_agg(to_char(planned_date, 'DD/MM/YYYY') || ' · ' || planned_quantity || ' palets · ' || coalesce(resource_id, 'Sin recurso'), ' | ' order by planned_date, id), 'Sin distribuir')
  into v_old_distribution
  from public.production_allocations
  where order_line_id = p_order_line_id and status = 'draft';

  select coalesce(sum(planned_quantity), 0) into v_fixed
  from public.production_allocations
  where order_line_id = p_order_line_id and status in ('confirmed','completed');
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
      (v_item->>'plannedQuantity')::integer, 'draft', nullif(trim(v_item->>'note'),''));
  end loop;

  select coalesce(string_agg(to_char(planned_date, 'DD/MM/YYYY') || ' · ' || planned_quantity || ' palets · ' || coalesce(resource_id, 'Sin recurso'), ' | ' order by planned_date, id), 'Sin distribuir')
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

revoke execute on function public.replace_production_allocations_v1(text,jsonb) from public, anon, authenticated;
grant execute on function public.replace_production_allocations_v1(text,jsonb) to service_role;
