-- Se puede registrar HT de una línea de pedido aunque el vínculo cliente/producto ya no esté activo.
-- El resto de la función es igual a la versión con controles opcionales.
CREATE OR REPLACE FUNCTION public.record_treatment_batch_v1(p_product_id text, p_client_product_id bigint, p_order_line_id text, p_quantity integer, p_performed_at timestamp with time zone, p_responsible text, p_note text, p_controls jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_requires_treatment boolean;
  v_client_product_id bigint := p_client_product_id;
  v_line_product_id text;
  v_line_client_product_id bigint;
  v_controls jsonb := coalesce(p_controls, '[]'::jsonb);
  v_control jsonb;
  v_control_row public.client_product_controls%rowtype;
  v_has_failure boolean := false;
  v_status text;
  v_batch_id bigint;
  v_transformation_id uuid := gen_random_uuid();
  v_pending_before integer := 0;
  v_ready_before integer := 0;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if nullif(trim(p_responsible), '') is null then raise exception 'Indique quién realizó el tratamiento.'; end if;
  if jsonb_typeof(v_controls) <> 'array' then raise exception 'El formato de controles es inválido.'; end if;

  select requires_treatment into v_requires_treatment from public.products where id = p_product_id;
  if not found then raise exception 'Producto no encontrado.'; end if;
  if not v_requires_treatment then raise exception 'El producto no requiere Tratamiento HT / Marcado.'; end if;

  if p_order_line_id is not null then
    select product_id, client_product_id into v_line_product_id, v_line_client_product_id
    from public.order_lines where id = p_order_line_id for share;
    if not found then raise exception 'Línea de pedido no encontrada.'; end if;
    if v_line_product_id is distinct from p_product_id then raise exception 'La línea no corresponde al producto seleccionado.'; end if;
    if v_line_client_product_id is null then raise exception 'La línea no tiene cliente/producto vinculado.'; end if;
    if p_client_product_id is not null and p_client_product_id <> v_line_client_product_id then raise exception 'La línea no corresponde al cliente/producto seleccionado.'; end if;
    v_client_product_id := v_line_client_product_id;
  end if;

  if v_client_product_id is not null then
    if not exists (
      select 1 from public.client_products
      where id = v_client_product_id and product_id = p_product_id
    ) then raise exception 'El cliente/producto no coincide con el producto.'; end if;
    for v_control in select * from jsonb_array_elements(v_controls) loop
      select * into v_control_row
      from public.client_product_controls
      where id = (v_control->>'controlId')::bigint and client_product_id = v_client_product_id and active;
      if not found then raise exception 'Uno de los controles no pertenece a la ficha seleccionada.'; end if;
      if (v_control->>'result') not in ('pass', 'fail') then raise exception 'Indique Conforme o No conforme en cada control.'; end if;
      if (v_control->>'result') = 'fail' then
        v_has_failure := true;
        if nullif(trim(v_control->>'note'), '') is null then raise exception 'Explique cada control no conforme.'; end if;
      end if;
    end loop;
  else
    if jsonb_array_length(v_controls) <> 0 then raise exception 'Stock general no admite controles específicos de cliente.'; end if;
  end if;

  if v_has_failure and nullif(trim(p_note), '') is null then raise exception 'Explique el rechazo del lote.'; end if;
  v_status := case when v_has_failure then 'rejected' else 'posted' end;

  if v_status = 'posted' then
    perform 1 from public.products where id = p_product_id for update;
    select coalesce(sum(quantity), 0) into v_pending_before
    from public.stock_movements where product_id = p_product_id and stock_state = 'pending_treatment';
    select coalesce(sum(quantity), 0) into v_ready_before
    from public.stock_movements where product_id = p_product_id and stock_state = 'ready';
    if v_pending_before < p_quantity then raise exception 'El stock pendiente no alcanza para confirmar el tratamiento.'; end if;
  else
    select coalesce(sum(quantity), 0) into v_pending_before
    from public.stock_movements where product_id = p_product_id and stock_state = 'pending_treatment';
    select coalesce(sum(quantity), 0) into v_ready_before
    from public.stock_movements where product_id = p_product_id and stock_state = 'ready';
  end if;

  insert into public.treatment_batches(
    product_id, client_product_id, order_line_id, quantity, performed_at, responsible, status, note
  ) values (
    p_product_id, v_client_product_id, p_order_line_id, p_quantity, coalesce(p_performed_at, now()), trim(p_responsible), v_status, nullif(trim(p_note), '')
  ) returning id into v_batch_id;

  if v_client_product_id is not null then
    for v_control in select * from jsonb_array_elements(v_controls) loop
      select * into v_control_row from public.client_product_controls where id = (v_control->>'controlId')::bigint;
      insert into public.treatment_control_checks(batch_id, control_id, control_title_snapshot, result, note)
      values (v_batch_id, v_control_row.id, v_control_row.title, v_control->>'result', nullif(trim(v_control->>'note'), ''));
    end loop;
  end if;

  if v_status = 'posted' then
    insert into public.stock_movements(product_id, stock_state, quantity, movement_type, treatment_batch_id, transformation_id, performed_at, responsible, note)
    values
      (p_product_id, 'pending_treatment', -p_quantity, 'treatment_out', v_batch_id, v_transformation_id, coalesce(p_performed_at, now()), trim(p_responsible), nullif(trim(p_note), '')),
      (p_product_id, 'ready', p_quantity, 'treatment_in', v_batch_id, v_transformation_id, coalesce(p_performed_at, now()), trim(p_responsible), nullif(trim(p_note), ''));
  end if;

  return jsonb_build_object(
    'batchId', v_batch_id,
    'status', v_status,
    'transformationId', case when v_status = 'posted' then v_transformation_id else null end,
    'previousPending', v_pending_before,
    'newPending', v_pending_before - case when v_status = 'posted' then p_quantity else 0 end,
    'previousReady', v_ready_before,
    'newReady', v_ready_before + case when v_status = 'posted' then p_quantity else 0 end
  );
end; $function$;
