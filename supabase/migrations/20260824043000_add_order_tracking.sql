alter table public.orders
  add column if not exists delivery_address text,
  add column if not exists delivery_status text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_at timestamptz;

alter table public.orders
  drop constraint if exists orders_delivery_status_check;

alter table public.orders
  add constraint orders_delivery_status_check
  check (delivery_status is null or delivery_status in ('programada', 'en_transito', 'parcial', 'completa', 'fallida', 'rechazada'));

alter table public.order_changes
  add column if not exists kind text not null default 'cambio',
  add column if not exists note text;

alter table public.order_changes
  drop constraint if exists order_changes_kind_check;

alter table public.order_changes
  add constraint order_changes_kind_check
  check (kind in ('cambio', 'entrega', 'direccion', 'despacho', 'incidencia'));

create or replace function public.record_operation_update(
  p_id text,
  p_kind text,
  p_delivered_quantity integer default null,
  p_delivery_address text default null,
  p_remittance text default null,
  p_dispatched_at timestamptz default null,
  p_delivered_at timestamptz default null,
  p_note text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_change_id uuid;
  v_new_delivered integer;
  v_new_pending integer;
  v_new_delivery_status text;
  v_position integer := 0;
begin
  if p_kind not in ('entrega', 'direccion', 'despacho', 'incidencia') then
    raise exception 'Tipo de actualización inválido.';
  end if;

  select * into v_order from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'P0002';
  end if;

  if p_kind = 'entrega' and (p_delivered_quantity is null or p_delivered_quantity <= 0) then
    raise exception 'Indique una cantidad entregada mayor a cero.';
  end if;
  if p_kind = 'entrega' and v_order.delivered + p_delivered_quantity > v_order.requested then
    raise exception 'La entrega no puede superar la cantidad del pedido.';
  end if;
  if p_kind = 'direccion' and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'Indique la dirección de entrega.';
  end if;
  if p_kind = 'incidencia' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Describa la incidencia.';
  end if;

  insert into public.order_changes(order_id, kind, note)
  values (p_id, p_kind, nullif(trim(p_note), ''))
  returning id into v_change_id;

  if p_kind = 'entrega' then
    v_new_delivered := v_order.delivered + p_delivered_quantity;
    v_new_pending := v_order.requested - v_new_delivered;
    v_new_delivery_status := case when v_new_pending = 0 then 'completa' else 'parcial' end;

    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Cantidad entregada', v_order.delivered::text, v_new_delivered::text, v_position);
    v_position := v_position + 1;
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Saldo', v_order.pending::text, v_new_pending::text, v_position);

    update public.orders set
      delivered = v_new_delivered,
      pending = v_new_pending,
      delivery = v_new_delivered || ' de ' || requested || ' entregados',
      delivery_status = v_new_delivery_status,
      delivered_at = coalesce(p_delivered_at, delivered_at, now()),
      stage = case when v_new_pending = 0 then 'completado' else stage end,
      status = case when v_new_pending = 0 then 'completado' else status end,
      status_label = case when v_new_pending = 0 then 'Completado' else status_label end,
      updated_at = now()
    where id = p_id;

    if v_new_pending = 0 and v_order.stage <> 'completado' then
      v_position := v_position + 1;
      insert into public.order_change_items(change_id, field, from_value, to_value, position)
      values (
        v_change_id,
        'Etapa',
        case v_order.stage when 'negociacion' then 'Negociación' when 'produccion' then 'Producción' when 'logistica' then 'Logística' else 'Completado' end,
        'Completado',
        v_position
      );
    end if;
  elsif p_kind = 'direccion' then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Dirección de entrega', coalesce(v_order.delivery_address, '—'), trim(p_delivery_address), v_position);
    update public.orders set delivery_address = trim(p_delivery_address), updated_at = now() where id = p_id;
  elsif p_kind = 'despacho' then
    if nullif(trim(coalesce(p_remittance, '')), '') is not null then
      insert into public.order_change_items(change_id, field, from_value, to_value, position)
      values (v_change_id, 'Remito', coalesce(v_order.remittance, '—'), trim(p_remittance), v_position);
      v_position := v_position + 1;
    end if;
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Despacho', coalesce(to_char(v_order.dispatched_at, 'DD/MM/YYYY HH24:MI'), '—'), to_char(coalesce(p_dispatched_at, now()), 'DD/MM/YYYY HH24:MI'), v_position);
    update public.orders set
      remittance = coalesce(nullif(trim(p_remittance), ''), remittance),
      dispatched_at = coalesce(p_dispatched_at, now()),
      delivery_status = 'en_transito',
      stage = case when stage = 'negociacion' then 'logistica' else stage end,
      updated_at = now()
    where id = p_id;
  elsif p_kind = 'incidencia' then
    insert into public.order_change_items(change_id, field, from_value, to_value, position)
    values (v_change_id, 'Incidencia', '—', trim(p_note), v_position);
  end if;

  return p_id;
end;
$$;

revoke all on function public.record_operation_update(text, text, integer, text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.record_operation_update(text, text, integer, text, text, timestamptz, timestamptz, text) to anon, authenticated;
