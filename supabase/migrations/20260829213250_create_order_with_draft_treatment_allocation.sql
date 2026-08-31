-- Stage 04 requires every new production assignment to start as draft until a
-- resource and the capacity rule used as evidence are selected. v5 predates
-- that invariant for orders opened directly in production.
create or replace function public.create_operation_order_v6(
  p_lines jsonb, p_order_date date, p_requested_delivery_date date, p_production_date date, p_planned_date date,
  p_reference text, p_notes text, p_stage text, p_production_source text, p_producer_provider_id text,
  p_import_arrival_date date, p_required_operations text[], p_transport_source text, p_transport_provider_id text
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_id text;
  v_creation_stage text;
begin
  if p_stage not in ('negociacion','produccion','logistica','atrasado','pospuesto','cancelado','reorganizando') then
    raise exception 'Etapa inválida.';
  end if;

  -- v5 only marks the initial allocation confirmed when the order begins in
  -- production. Create it as draft, then restore the requested order stage.
  v_creation_stage := case when p_stage = 'produccion' then 'negociacion' else p_stage end;
  v_id := public.create_operation_order_v5(
    p_lines, p_order_date, p_requested_delivery_date, p_production_date, p_planned_date,
    p_reference, p_notes, v_creation_stage, p_production_source, p_producer_provider_id,
    p_import_arrival_date, p_required_operations, p_transport_source, p_transport_provider_id
  );

  if p_stage <> v_creation_stage then
    update public.orders set stage = p_stage where id = v_id;
  end if;
  return v_id;
end; $$;

revoke execute on function public.create_operation_order_v6(jsonb,date,date,date,date,text,text,text,text,text,date,text[],text,text) from public, anon, authenticated;
grant execute on function public.create_operation_order_v6(jsonb,date,date,date,date,text,text,text,text,text,date,text[],text,text) to service_role;

notify pgrst, 'reload schema';
