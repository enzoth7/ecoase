-- The first stage-05 migration delegated to v4, which only accepted the legacy
-- marking/ht values. Keep the public contract canonical all the way through.
create or replace function public.create_operation_order_v5(
  p_lines jsonb, p_order_date date, p_requested_delivery_date date, p_production_date date, p_planned_date date,
  p_reference text, p_notes text, p_stage text, p_production_source text, p_producer_provider_id text,
  p_import_arrival_date date, p_required_operations text[], p_transport_source text, p_transport_provider_id text
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_item jsonb; v_link public.client_products%rowtype; v_client public.clients%rowtype; v_product public.products%rowtype;
  v_client_id text; v_id text; v_reference text; v_transport text; v_producer text; v_product_summary text := ''; v_zeta_summary text := '';
  v_total integer := 0; v_quantity integer; v_position integer := 0; v_line_id text; v_shipment_id bigint;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Indique al menos una línea.'; end if;
  if p_order_date is null or p_requested_delivery_date is null or p_planned_date is null then raise exception 'Las fechas son obligatorias.'; end if;
  if p_stage not in ('negociacion','produccion','logistica','atrasado','pospuesto','cancelado','reorganizando') then raise exception 'Etapa inválida.'; end if;
  if p_production_source not in ('internal','sawmill','import') or p_transport_source not in ('internal','external') then raise exception 'Origen operativo inválido.'; end if;
  if cardinality(p_required_operations) = 0 or not (p_required_operations <@ array['assembly','treatment']::text[]) then raise exception 'Seleccione operaciones válidas.'; end if;
  if p_production_source = 'sawmill' and not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Aserradero') then raise exception 'Seleccione un aserradero registrado.'; end if;
  if p_production_source <> 'import' and p_production_date is null then raise exception 'Indique la fecha de producción.'; end if;
  if p_production_source = 'import' and (p_import_arrival_date is null or not exists (select 1 from public.providers where id = p_producer_provider_id and type = 'Importador')) then raise exception 'Seleccione un importador y fecha de llegada.'; end if;
  if p_transport_source = 'external' and not exists (select 1 from public.providers where id = p_transport_provider_id and type = 'Transporte') then raise exception 'Seleccione un transportista registrado.'; end if;

  for v_item in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Cada línea necesita una cantidad mayor a cero.'; end if;
    select * into v_link from public.client_products where id = (v_item->>'clientProductId')::bigint and active for share;
    if not found then raise exception 'Un producto no está habilitado.'; end if;
    if v_client_id is null then v_client_id := v_link.client_id; elsif v_client_id <> v_link.client_id then raise exception 'Todas las líneas deben pertenecer al mismo cliente.'; end if;
    if not exists (select 1 from public.client_product_controls where client_product_id = v_link.id and active)
      or not exists (select 1 from public.client_product_assets where client_product_id = v_link.id and active and is_primary) then
      raise exception 'Una ficha de producto está incompleta.';
    end if;
    select * into v_product from public.products where id = v_link.product_id;
    v_product_summary := concat_ws(' · ', nullif(v_product_summary, ''), coalesce(nullif(trim(v_link.operational_name), ''), concat_ws(' ', v_product.kind, v_product.measure)));
    v_zeta_summary := concat_ws(' · ', nullif(v_zeta_summary, ''), v_link.zeta_code);
    v_total := v_total + v_quantity;
  end loop;

  select * into v_client from public.clients where id = v_client_id and active and nullif(trim(address), '') is not null;
  if not found then raise exception 'El cliente no está activo o no tiene dirección.'; end if;
  select name into v_transport from public.providers where id = p_transport_provider_id;
  select name into v_producer from public.providers where id = p_producer_provider_id;
  v_transport := case when p_transport_source = 'internal' then 'Interno' else v_transport end;
  v_id := 'pedido-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  select coalesce(nullif(trim(p_reference), ''), 'Pedido ' || (count(*) + 1)::text) into v_reference from public.orders;

  insert into public.orders(id, reference, client, product, requested, delivered, pending, status, status_label, stage,
    order_date, requested_delivery_date, planned_date, transport, supply, preparation, logistics, delivery, action,
    delivery_address, zeta_code, notes, source, production_source, producer_provider_id, production_date,
    import_arrival_date, required_operations, transport_source, transport_provider_id)
  values (v_id, v_reference, v_client.name, v_product_summary, v_total, 0, v_total, 'coordinacion', 'En coordinación', p_stage,
    p_order_date, p_requested_delivery_date, p_planned_date, v_transport,
    case p_production_source when 'internal' then 'Producción interna' when 'sawmill' then 'Produce ' || v_producer else 'Importación · llegada ' || p_import_arrival_date::text end,
    'Operaciones: ' || array_to_string(p_required_operations, ', '), v_transport || ' · entrega planificada', '0 de ' || v_total || ' entregados',
    'Preparar y coordinar la entrega.', v_client.address, v_zeta_summary, nullif(trim(p_notes), ''), 'Alta con líneas, producción y viaje',
    p_production_source, p_producer_provider_id, p_production_date, p_import_arrival_date, p_required_operations, p_transport_source, p_transport_provider_id);

  insert into public.shipments(order_id, planned_date, status, transport_source, transport_provider_id)
  values (v_id, p_planned_date, 'planned', p_transport_source, p_transport_provider_id) returning id into v_shipment_id;

  for v_item in select * from jsonb_array_elements(p_lines) loop
    select * into v_link from public.client_products where id = (v_item->>'clientProductId')::bigint;
    select * into v_product from public.products where id = v_link.product_id;
    v_quantity := (v_item->>'quantity')::integer;
    v_line_id := v_id || '-' || (v_position + 1);
    insert into public.order_lines(id, order_id, product, product_id, client_product_id, quantity, requested_quantity, position)
    values (v_line_id, v_id, coalesce(nullif(trim(v_link.operational_name), ''), concat_ws(' · ', v_product.kind, coalesce(v_product.measure,'Sin medida'), case when v_product.requires_treatment then 'Tratamiento HT / Marcado' else 'Sin tratamiento' end)), v_product.id, v_link.id, v_quantity, v_quantity, v_position);
    insert into public.production_allocations(order_line_id, resource_id, planned_date, planned_quantity, status)
    values (v_line_id, case when p_production_source = 'internal' then 'internal' else p_producer_provider_id end,
      coalesce(p_production_date, p_import_arrival_date), v_quantity, case when p_stage = 'produccion' then 'confirmed' else 'draft' end);
    insert into public.shipment_lines(shipment_id, order_line_id, planned_quantity) values (v_shipment_id, v_line_id, v_quantity);
    v_position := v_position + 1;
  end loop;
  insert into public.shipment_events(shipment_id, event_type, next_status, next_date, responsible)
  values (v_shipment_id, 'created', 'planned', p_planned_date, 'Sistema');
  return v_id;
end; $$;

revoke execute on function public.create_operation_order_v5(jsonb,date,date,date,date,text,text,text,text,text,date,text[],text,text) from public, anon, authenticated;
grant execute on function public.create_operation_order_v5(jsonb,date,date,date,date,text,text,text,text,text,date,text[],text,text) to service_role;

notify pgrst, 'reload schema';
