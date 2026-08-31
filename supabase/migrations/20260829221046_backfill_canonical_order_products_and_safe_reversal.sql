update public.order_lines ol set product_id=matched.product_id
from (
  select ol2.id,
    case
      when o.client='AFB' and ol2.product ilike '%120 × 100%Mercosur%' then 'palbin-p21'
      when o.client='Granja Pocha' and ol2.product ilike '%punto rojo%' then 'palbin-p07'
      when o.client='Granja Pocha' and ol2.product ilike '%Mercosur exportación%' then 'palbin-p27'
      when o.client='Pamer' and ol2.product ilike '%100 × 100%doble entrada%' then 'pamer-p02'
      when o.client='Pamer' and ol2.product ilike '%120 × 80%doble entrada%' then 'pamer-p05'
      when o.client='Pamer' and ol2.product ilike '%100 × 120%Mercosur%' then 'pamer-p03'
      when o.client='Pamer' and ol2.product ilike '%216 × 110%simple%' then 'pamer-p21'
      when o.client='Pamer' and ol2.product ilike '%120 × 90%cerrado%' then 'pamer-p07'
      when o.client='Granja Pocha' and ol2.product ilike '%100 × 100%HT%' then 'pamer-p02'
      when o.client='Pontevedra' and ol2.product ilike '%Mercosur%' then 'palbin-p27'
      when o.client='Proquimur' and ol2.product ilike '%120 × 100%Mercosur%' then 'palbin-p11'
      when o.client='San Miguel' and ol2.product ilike '%116,5 × 114%' then 'palbin-p33'
    end product_id
  from public.order_lines ol2 join public.orders o on o.id=ol2.order_id
  where ol2.product_id is null
) matched
where ol.id=matched.id and matched.product_id is not null;

create or replace function public.reverse_stock_movement_v1(
  p_movement_id bigint,p_occurred_at timestamptz,p_responsible text,p_reason text
) returns bigint language plpgsql security invoker set search_path=public as $$
declare v_original public.stock_movements%rowtype; v_balance integer; v_id bigint;
begin
  if nullif(trim(p_responsible),'') is null or nullif(trim(p_reason),'') is null then raise exception 'Responsable y motivo son obligatorios.'; end if;
  select * into v_original from public.stock_movements where id=p_movement_id for share;
  if not found then raise exception 'Movimiento no encontrado.'; end if;
  if v_original.movement_type not in ('internal_production','supplier_receipt','return','waste','adjustment') then raise exception 'Este movimiento se corrige desde su proceso de origen, no de forma aislada.'; end if;
  if exists(select 1 from public.stock_movements where correction_of_movement_id=p_movement_id) then raise exception 'El movimiento ya fue revertido.'; end if;
  perform 1 from public.products where id=v_original.product_id for update;
  select coalesce(sum(quantity),0) into v_balance from public.stock_movements where product_id=v_original.product_id and stock_state=v_original.stock_state;
  if v_balance-v_original.quantity<0 then raise exception 'La reversión dejaría stock negativo.'; end if;
  insert into public.stock_movements(product_id,stock_state,quantity,movement_type,performed_at,responsible,note,correction_of_movement_id,transformation_id)
  values(v_original.product_id,v_original.stock_state,-v_original.quantity,'reversal',coalesce(p_occurred_at,now()),trim(p_responsible),trim(p_reason),p_movement_id,gen_random_uuid()) returning id into v_id;
  return v_id;
end; $$;

revoke execute on function public.reverse_stock_movement_v1(bigint,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.reverse_stock_movement_v1(bigint,timestamptz,text,text) to service_role;
notify pgrst,'reload schema';
