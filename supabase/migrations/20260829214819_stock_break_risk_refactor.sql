-- Stage 06: immutable stock ledger, reservations, stock-break risk and audited opening balances.
create extension if not exists btree_gist with schema extensions;

alter table public.products
  add column if not exists stock_name text,
  add column if not exists source_catalog text,
  add column if not exists source_code text,
  add column if not exists stock_active boolean not null default true;

alter table public.products drop constraint if exists products_source_catalog_check;
alter table public.products add constraint products_source_catalog_check
  check (source_catalog is null or source_catalog in ('Palbin','Pamer','Manual'));
create unique index if not exists products_source_catalog_code_unique
  on public.products(source_catalog, source_code)
  where source_catalog is not null and source_code is not null;

insert into public.products(id,kind,measure,treatment,requires_treatment,stock_name,source_catalog,source_code,stock_active) values
('palbin-p01','Pallet','106 × 119','Marcado',true,'CRISTAL PET','Palbin','P01',true),
('palbin-p02','Pallet','120 × 100','Marcado',true,'PALETS CITRUS (120X100)','Palbin','P02',true),
('palbin-p03','Pallet','120 × 100','Marcado',true,'MOLINOS SAN JOSE','Palbin','P03',true),
('palbin-p04','Pallet','106 × 106',null,false,'SAINT GOBAIN','Palbin','P04',true),
('palbin-p05','Pallet','122 × 102','Marcado',true,'122X102','Palbin','P05',true),
('palbin-p06','Pallet','120 × 100',null,false,'REPARADOS','Palbin','P06',true),
('palbin-p07','Pallet',null,'Marcado',true,'GRANJA POCHA (punto rojo)','Palbin','P07',true),
('palbin-p08','Pallet',null,'Marcado',true,'AZUCARLITO','Palbin','P08',true),
('palbin-p09','Piso',null,'Marcado',true,'PISOS EXPORTACION','Palbin','P09',true),
('palbin-p10','Pallet','120 × 100','Marcado',true,'FRICASA (120X100)','Palbin','P10',true),
('palbin-p11','Pallet','120 × 100','Marcado',true,'PROQUIMUR (120X100)','Palbin','P11',true),
('palbin-p12','Pallet','120 × 100','Marcado',true,'CONAPROLE (120X100)','Palbin','P12',true),
('palbin-p13','Pallet','120 × 80','Marcado',true,'120X80','Palbin','P13',true),
('palbin-p14','Piso',null,null,false,'PISOS CHACRA','Palbin','P14',true),
('palbin-p15','Bin',null,'Marcado',true,'BINS X3 (EXPORTACION)','Palbin','P15',true),
('palbin-p16','Bin',null,'Marcado',true,'BINS X2 (EXPORTACION)','Palbin','P16',true),
('palbin-p17','Bin',null,null,false,'BINS CHACRA AZUL','Palbin','P17',true),
('palbin-p18','Bin',null,null,false,'BINS CHACRA BLANCO','Palbin','P18',true),
('palbin-p19','Bin',null,null,false,'BINS CHACRA ROJO','Palbin','P19',true),
('palbin-p20','Bin',null,null,false,'BINS CHACRA ANARANJADO','Palbin','P20',true),
('palbin-p21','Pallet','120 × 100','Marcado',true,'AFB (120X100)','Palbin','P21',true),
('palbin-p22','Pallet','220 × 117','Marcado',true,'AFB (220X117)','Palbin','P22',true),
('palbin-p23','Pallet','120 × 120','Marcado',true,'PALLET 120X100 TIPO MSJ MIIRASOL (ARG)','Palbin','P23',true),
('palbin-p24','Bin',null,'Marcado',true,'BINS LIO X3','Palbin','P24',true),
('palbin-p25','Pallet','103 × 121','Marcado',true,'PALLET CITRUS 103X121','Palbin','P25',true),
('palbin-p26','Pallet','122 × 102','Marcado',true,'PALLET NUM 6 122 X 102','Palbin','P26',true),
('palbin-p27','Pallet','120 × 100','Marcado',true,'PALLET MERCOSUR CON CORTE','Palbin','P27',true),
('palbin-p28','Pallet','120 × 100','Marcado',true,'PÁLLET MERCOSUR SIN CORTE','Palbin','P28',true),
('palbin-p29','Pallet','120 × 100','Marcado',true,'ALUMINOS DEL URUGUAY 120X100','Palbin','P29',true),
('palbin-p30','Pallet','113 × 113','Marcado',true,'SAN MIGUEL 113X113','Palbin','P30',true),
('palbin-p31','Pallet','120 × 130','Marcado',true,'PALLET 120X130','Palbin','P31',true),
('palbin-p32','Pallet','112 × 120','Marcado',true,'PALLET 112X120','Palbin','P32',true),
('palbin-p33','Pallet','116,5 × 114','Marcado',true,'SAN MIGUEL PALLET 116.5X114','Palbin','P33',true),
('palbin-p34','Pallet','120 × 120',null,false,'SAN MIGUEL 120X120','Palbin','P34',false),
('palbin-p35','Pallet','120 × 120',null,false,'SAN MIGUEL 120X120 reforzado','Palbin','P35',false),
('palbin-p36','Pallet','120 × 100','Marcado',true,'PALLET PREINCO 120X100','Palbin','P36',true),
('palbin-p37','Bin',null,null,false,'BINS CHACRA CHAPICUY','Palbin','P37',false),
('palbin-p38','Pallet','220 × 120','Marcado',true,'PALLET 220X120 MSJ','Palbin','P38',true),
('palbin-p39','Pallet','120 × 100','Marcado',true,'AVANTI 120x100','Palbin','P39',true),
('pamer-p01','Pallet','100 × 80','HT',true,'100x80 ABIERTAS','Pamer','P01',true),
('pamer-p02','Pallet','100 × 100','HT',true,'100x100 ABIERTAS','Pamer','P02',true),
('pamer-p03','Pallet','100 × 120','HT',true,'100x120 MERCOSUR LIVIANO','Pamer','P03',true),
('pamer-p04','Pallet','120 × 100','HT',true,'120x100 ADIUM REF','Pamer','P04',true),
('pamer-p05','Pallet','120 × 80','HT',true,'120x80 ABIERTAS','Pamer','P05',true),
('pamer-p06','Pallet','120 × 80','HT',true,'120x80 CERRADAS','Pamer','P06',true),
('pamer-p07','Pallet','120 × 90','HT',true,'120x90 CERRADAS','Pamer','P07',true),
('pamer-p08','Pallet','120 × 100','HT',true,'120x100 ABIERTAS','Pamer','P08',true),
('pamer-p09','Pallet','120 × 100','HT',true,'120x100 CERRADAS','Pamer','P09',true),
('pamer-p10','Pallet','120 × 120','HT',true,'120x120 CERRADAS','Pamer','P10',true),
('pamer-p11','Pallet','120 × 120','HT',true,'120x120 ABIERTAS','Pamer','P11',true),
('pamer-p12','Pallet','130 × 90','HT',true,'130x90 CERRADAS','Pamer','P12',true),
('pamer-p13','Pallet','140 × 120','HT',true,'140x120 ABIERTAS','Pamer','P13',true),
('pamer-p14','Pallet','140 × 120','HT',true,'140x120 CERRADAS','Pamer','P14',true),
('pamer-p15','Pallet','145 × 80','HT',true,'145x80 ABIERTAS REF','Pamer','P15',true),
('pamer-p16','Pallet','145 × 100','HT',true,'145x100 ABIERTAS','Pamer','P16',true),
('pamer-p17','Pallet','145 × 100','HT',true,'145x100 CERRADAS','Pamer','P17',true),
('pamer-p18','Pallet','155 × 70','HT',true,'155x70 ABIERTAS','Pamer','P18',true),
('pamer-p19','Pallet','160 × 80','HT',true,'160x80 ABIERTAS','Pamer','P19',true),
('pamer-p20','Pallet','160 × 110','HT',true,'160x110 SIMPLES REFORZADAS','Pamer','P20',true),
('pamer-p21','Pallet','216 × 110','HT',true,'216x110 SIMPLES REFORZADAS','Pamer','P21',true),
('pamer-p22','Pallet','130 × 120',null,false,'130X120','Pamer','P22',true)
on conflict (id) do update set
  kind=excluded.kind, measure=excluded.measure, treatment=excluded.treatment,
  requires_treatment=excluded.requires_treatment, stock_name=excluded.stock_name,
  source_catalog=excluded.source_catalog, source_code=excluded.source_code,
  stock_active=excluded.stock_active;

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements drop constraint if exists stock_movements_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'opening_balance','internal_production','supplier_receipt','production_receipt',
  'treatment_out','treatment_in','treatment_reversal_out','treatment_reversal_in',
  'dispatch','return','waste','adjustment','reversal'
));
alter table public.stock_movements
  add column if not exists client_id text references public.clients(id) on delete restrict,
  add column if not exists provider_id text references public.providers(id) on delete restrict,
  add column if not exists order_line_id text references public.order_lines(id) on delete restrict,
  add column if not exists shipment_line_id bigint references public.shipment_lines(id) on delete restrict,
  add column if not exists remittance text,
  add column if not exists source_reference text;

create table public.stock_import_runs (
  id bigint generated always as identity primary key,
  source_file text not null,
  source_sheet text not null,
  source_catalog text not null check (source_catalog in ('Palbin','Pamer')),
  as_of_date date not null,
  imported_at timestamptz not null default now(),
  imported_by text not null,
  expected_pending integer not null check (expected_pending >= 0),
  expected_ready integer not null check (expected_ready >= 0),
  status text not null check (status in ('reconciled','needs_review')),
  note text,
  unique(source_file,source_sheet,as_of_date)
);

create table public.stock_import_rows (
  id bigint generated always as identity primary key,
  import_run_id bigint not null references public.stock_import_runs(id) on delete restrict,
  source_row integer not null,
  source_code text not null,
  source_name text not null,
  product_id text references public.products(id) on delete restrict,
  pending_quantity integer not null check (pending_quantity >= 0),
  ready_quantity integer not null check (ready_quantity >= 0),
  mapping_status text not null check (mapping_status in ('mapped','ambiguous','unmapped')),
  mapping_note text,
  unique(import_run_id,source_row)
);

alter table public.stock_movements
  add column if not exists import_row_id bigint references public.stock_import_rows(id) on delete restrict;
alter table public.stock_movements add constraint stock_movements_semantics_check check (
  (movement_type='opening_balance' and quantity>0 and import_row_id is not null)
  or (movement_type in ('internal_production','supplier_receipt','return') and quantity>0)
  or (movement_type='production_receipt' and quantity>0 and production_allocation_id is not null)
  or (movement_type='treatment_out' and stock_state='pending_treatment' and quantity<0 and treatment_batch_id is not null)
  or (movement_type='treatment_in' and stock_state='ready' and quantity>0 and treatment_batch_id is not null)
  or (movement_type='treatment_reversal_out' and stock_state='ready' and quantity<0 and treatment_batch_id is not null)
  or (movement_type='treatment_reversal_in' and stock_state='pending_treatment' and quantity>0 and treatment_batch_id is not null)
  or (movement_type in ('dispatch','waste') and quantity<0)
  or (movement_type in ('adjustment','reversal') and quantity<>0)
);
create unique index if not exists stock_movements_opening_import_unique
  on public.stock_movements(import_row_id,stock_state)
  where movement_type='opening_balance';
create unique index if not exists stock_movements_dispatch_line_unique
  on public.stock_movements(shipment_line_id)
  where movement_type='dispatch';
create unique index if not exists stock_movements_single_correction_unique
  on public.stock_movements(correction_of_movement_id)
  where correction_of_movement_id is not null;
create index if not exists stock_movements_occurred_idx on public.stock_movements(performed_at desc,id desc);

create table public.stock_reservations (
  id bigint generated always as identity primary key,
  shipment_line_id bigint not null references public.shipment_lines(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','consumed','released')),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  responsible text not null,
  note text,
  check ((status='active' and consumed_at is null and released_at is null)
    or (status='consumed' and consumed_at is not null and released_at is null)
    or (status='released' and released_at is not null and consumed_at is null))
);
create unique index stock_reservations_one_active_per_line
  on public.stock_reservations(shipment_line_id) where status='active';
create index stock_reservations_product_active_idx
  on public.stock_reservations(product_id) where status='active';

create table public.client_product_consumption (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  daily_consumption numeric(12,2) not null check (daily_consumption >= 0),
  workdays_per_week integer not null check (workdays_per_week between 1 and 7),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  valid_from date not null,
  valid_to date,
  source text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  exclude using gist (
    client_id with =,
    product_id with =,
    daterange(valid_from,coalesce(valid_to,'infinity'::date),'[]') with &&
  )
);
create index client_product_consumption_current_idx
  on public.client_product_consumption(product_id,valid_from,valid_to);

create trigger client_product_consumption_set_updated_at before update on public.client_product_consumption
for each row execute function public.set_client_master_updated_at();

alter table public.stock_import_runs enable row level security;
alter table public.stock_import_rows enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.client_product_consumption enable row level security;
create policy stock_import_runs_read on public.stock_import_runs for select to anon,authenticated using (true);
create policy stock_import_rows_read on public.stock_import_rows for select to anon,authenticated using (true);
create policy stock_reservations_read on public.stock_reservations for select to anon,authenticated using (true);
create policy client_product_consumption_read on public.client_product_consumption for select to anon,authenticated using (true);
grant select on public.stock_import_runs,public.stock_import_rows,public.stock_reservations,public.client_product_consumption to anon,authenticated;
grant select,insert,update on public.stock_import_runs,public.stock_import_rows,public.stock_reservations,public.client_product_consumption to service_role;
grant usage,select on sequence public.stock_import_runs_id_seq,public.stock_import_rows_id_seq,public.stock_reservations_id_seq,public.client_product_consumption_id_seq to service_role;

create or replace view public.stock_balances with (security_invoker=true) as
select p.id product_id,
  coalesce(sum(sm.quantity) filter (where sm.stock_state='pending_treatment'),0)::integer pending_quantity,
  coalesce(sum(sm.quantity) filter (where sm.stock_state='ready'),0)::integer ready_quantity,
  coalesce((select sum(sr.quantity) from public.stock_reservations sr where sr.product_id=p.id and sr.status='active'),0)::integer reserved_quantity,
  (coalesce(sum(sm.quantity) filter (where sm.stock_state='ready'),0)-coalesce((select sum(sr.quantity) from public.stock_reservations sr where sr.product_id=p.id and sr.status='active'),0))::integer available_quantity,
  coalesce(sum(sm.quantity),0)::integer physical_quantity,
  max(sm.performed_at) last_movement_at
from public.products p left join public.stock_movements sm on sm.product_id=p.id
where p.stock_active
group by p.id;

create or replace view public.stock_risk with (security_invoker=true) as
with demand as (
  select product_id,sum(daily_consumption)::numeric daily_consumption,
    sum(daily_consumption*workdays_per_week)::numeric weekly_consumption,
    sum(safety_stock)::integer safety_stock
  from public.client_product_consumption
  where current_date>=valid_from and (valid_to is null or current_date<=valid_to)
  group by product_id
), base as (
  select b.*,coalesce(d.daily_consumption,0) daily_consumption,
    coalesce(d.weekly_consumption,0) weekly_consumption,coalesce(d.safety_stock,0) safety_stock,
    case when coalesce(d.daily_consumption,0)>0
      then greatest(b.available_quantity-coalesce(d.safety_stock,0),0)/d.daily_consumption
    end days_to_break
  from public.stock_balances b left join demand d on d.product_id=b.product_id
)
select base.*,
  case when daily_consumption<=0 then 'gray'
    when days_to_break<3 then 'red'
    when days_to_break<7 then 'orange'
    when days_to_break<14 then 'yellow'
    else 'green' end risk_level,
  case when daily_consumption<=0 then null else current_date+ceil(days_to_break)::integer end estimated_break_date
from base;

create or replace view public.stock_daily_projection with (security_invoker=true) as
with days as (select generate_series(current_date,current_date+29,interval '1 day')::date projection_date),
consumption as (
  select d.projection_date,c.product_id,sum(c.daily_consumption) daily_outgoing
  from days d join public.client_product_consumption c
    on d.projection_date>=c.valid_from and (c.valid_to is null or d.projection_date<=c.valid_to)
    and extract(isodow from d.projection_date)<=c.workdays_per_week
  group by d.projection_date,c.product_id
), incoming as (
  select pa.planned_date projection_date,ol.product_id,sum(pa.planned_quantity)::numeric incoming
  from public.production_allocations pa join public.order_lines ol on ol.id=pa.order_line_id
  where pa.status='confirmed' and pa.planned_date between current_date and current_date+29
  group by pa.planned_date,ol.product_id
), outgoing as (
  select s.planned_date projection_date,ol.product_id,sum(sl.planned_quantity)::numeric planned_outgoing
  from public.shipments s join public.shipment_lines sl on sl.shipment_id=s.id
  join public.order_lines ol on ol.id=sl.order_line_id
  where s.status='planned' and s.planned_date between current_date and current_date+29
  group by s.planned_date,ol.product_id
), grid as (
  select b.product_id,b.available_quantity,d.projection_date,
    coalesce(i.incoming,0) incoming,coalesce(o.planned_outgoing,0) planned_outgoing,
    coalesce(c.daily_outgoing,0) daily_outgoing
  from public.stock_balances b cross join days d
  left join incoming i on i.product_id=b.product_id and i.projection_date=d.projection_date
  left join outgoing o on o.product_id=b.product_id and o.projection_date=d.projection_date
  left join consumption c on c.product_id=b.product_id and c.projection_date=d.projection_date
)
select product_id,projection_date,incoming,planned_outgoing,daily_outgoing,
  available_quantity+sum(incoming-planned_outgoing-daily_outgoing) over(partition by product_id order by projection_date) projected_available
from grid;

grant select on public.stock_balances,public.stock_risk,public.stock_daily_projection to anon,authenticated,service_role;

create or replace function public.record_stock_receipt_v1(
  p_product_id text,p_stock_state text,p_quantity integer,p_movement_type text,
  p_provider_id text,p_source_reference text,p_occurred_at timestamptz,p_responsible text,p_note text
) returns bigint language plpgsql security invoker set search_path=public as $$
declare v_id bigint;
begin
  if p_stock_state not in ('pending_treatment','ready') then raise exception 'Estado de stock inválido.'; end if;
  if p_movement_type not in ('internal_production','supplier_receipt','return') then raise exception 'Tipo de recepción inválido.'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if nullif(trim(p_responsible),'') is null then raise exception 'Indique responsable.'; end if;
  if p_movement_type='supplier_receipt' and p_provider_id is null then raise exception 'Indique proveedor.'; end if;
  perform 1 from public.products where id=p_product_id for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  insert into public.stock_movements(product_id,stock_state,quantity,movement_type,provider_id,source_reference,performed_at,responsible,note,transformation_id)
  values(p_product_id,p_stock_state,p_quantity,p_movement_type,p_provider_id,nullif(trim(p_source_reference),''),coalesce(p_occurred_at,now()),trim(p_responsible),nullif(trim(p_note),''),gen_random_uuid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.record_stock_adjustment_v1(
  p_product_id text,p_stock_state text,p_quantity_delta integer,p_occurred_at timestamptz,p_responsible text,p_reason text
) returns bigint language plpgsql security invoker set search_path=public as $$
declare v_id bigint; v_balance integer;
begin
  if p_stock_state not in ('pending_treatment','ready') or p_quantity_delta is null or p_quantity_delta=0 then raise exception 'Estado o cantidad de ajuste inválidos.'; end if;
  if nullif(trim(p_responsible),'') is null or nullif(trim(p_reason),'') is null then raise exception 'Responsable y motivo son obligatorios.'; end if;
  perform 1 from public.products where id=p_product_id for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  select coalesce(sum(quantity),0) into v_balance from public.stock_movements where product_id=p_product_id and stock_state=p_stock_state;
  if v_balance+p_quantity_delta<0 then raise exception 'El ajuste dejaría stock negativo.'; end if;
  insert into public.stock_movements(product_id,stock_state,quantity,movement_type,performed_at,responsible,note,transformation_id)
  values(p_product_id,p_stock_state,p_quantity_delta,'adjustment',coalesce(p_occurred_at,now()),trim(p_responsible),trim(p_reason),gen_random_uuid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.reverse_stock_movement_v1(
  p_movement_id bigint,p_occurred_at timestamptz,p_responsible text,p_reason text
) returns bigint language plpgsql security invoker set search_path=public as $$
declare v_original public.stock_movements%rowtype; v_balance integer; v_id bigint;
begin
  if nullif(trim(p_responsible),'') is null or nullif(trim(p_reason),'') is null then raise exception 'Responsable y motivo son obligatorios.'; end if;
  select * into v_original from public.stock_movements where id=p_movement_id for share;
  if not found then raise exception 'Movimiento no encontrado.'; end if;
  if v_original.movement_type='reversal' or exists(select 1 from public.stock_movements where correction_of_movement_id=p_movement_id) then raise exception 'El movimiento ya fue revertido o no admite otra reversión.'; end if;
  perform 1 from public.products where id=v_original.product_id for update;
  select coalesce(sum(quantity),0) into v_balance from public.stock_movements where product_id=v_original.product_id and stock_state=v_original.stock_state;
  if v_balance-v_original.quantity<0 then raise exception 'La reversión dejaría stock negativo.'; end if;
  insert into public.stock_movements(product_id,stock_state,quantity,movement_type,performed_at,responsible,note,correction_of_movement_id,transformation_id)
  values(v_original.product_id,v_original.stock_state,-v_original.quantity,'reversal',coalesce(p_occurred_at,now()),trim(p_responsible),trim(p_reason),p_movement_id,gen_random_uuid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.upsert_client_product_consumption_v1(
  p_client_id text,p_product_id text,p_daily_consumption numeric,p_workdays_per_week integer,
  p_safety_stock integer,p_valid_from date,p_valid_to date,p_source text,p_note text
) returns bigint language plpgsql security invoker set search_path=public as $$
declare v_id bigint;
begin
  if p_daily_consumption is null or p_daily_consumption<0 or p_workdays_per_week not between 1 and 7 or p_safety_stock<0 then raise exception 'Consumo, días o stock de seguridad inválidos.'; end if;
  if p_valid_from is null or nullif(trim(p_source),'') is null then raise exception 'Vigencia y fuente son obligatorias.'; end if;
  insert into public.client_product_consumption(client_id,product_id,daily_consumption,workdays_per_week,safety_stock,valid_from,valid_to,source,note)
  values(p_client_id,p_product_id,p_daily_consumption,p_workdays_per_week,p_safety_stock,p_valid_from,p_valid_to,trim(p_source),nullif(trim(p_note),'')) returning id into v_id;
  return v_id;
end; $$;

revoke execute on function public.record_stock_receipt_v1(text,text,integer,text,text,text,timestamptz,text,text) from public,anon,authenticated;
revoke execute on function public.record_stock_adjustment_v1(text,text,integer,timestamptz,text,text) from public,anon,authenticated;
revoke execute on function public.reverse_stock_movement_v1(bigint,timestamptz,text,text) from public,anon,authenticated;
revoke execute on function public.upsert_client_product_consumption_v1(text,text,numeric,integer,integer,date,date,text,text) from public,anon,authenticated;
grant execute on function public.record_stock_receipt_v1(text,text,integer,text,text,text,timestamptz,text,text) to service_role;
grant execute on function public.record_stock_adjustment_v1(text,text,integer,timestamptz,text,text) to service_role;
grant execute on function public.reverse_stock_movement_v1(bigint,timestamptz,text,text) to service_role;
grant execute on function public.upsert_client_product_consumption_v1(text,text,numeric,integer,integer,date,date,text,text) to service_role;

create or replace function public.transition_shipment_v2(
  p_shipment_id bigint,p_next_status text,p_remittance text,p_shared_remittance_reason text,p_delivered_lines jsonb,p_responsible text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_shipment public.shipments%rowtype; v_expected text; v_address text; v_item jsonb; v_line public.shipment_lines%rowtype; v_product_id text; v_available integer; v_now timestamptz:=now();
begin
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  v_expected:=case v_shipment.status when 'planned' then 'ready' when 'ready' then 'loaded' when 'loaded' then 'dispatched' when 'dispatched' then 'delivered' else null end;
  if p_next_status='cancelled' and v_shipment.status not in ('dispatched','delivered','cancelled') then v_expected:='cancelled'; end if;
  if p_next_status<>v_expected then raise exception 'Transición inválida desde %.',v_shipment.status; end if;
  if p_next_status not in ('planned','cancelled') and nullif(trim(coalesce(p_remittance,v_shipment.remittance)),'') is null then raise exception 'El remito es obligatorio.'; end if;
  if p_next_status not in ('planned','cancelled') and exists(select 1 from public.shipments where id<>p_shipment_id and status<>'cancelled' and lower(trim(remittance))=lower(trim(coalesce(p_remittance,v_shipment.remittance)))) and nullif(trim(p_shared_remittance_reason),'') is null then raise exception 'Ese remito ya pertenece a otro viaje; indique el motivo para compartirlo.'; end if;
  if p_next_status='ready' then select delivery_address into v_address from public.orders where id=v_shipment.order_id; else v_address:=v_shipment.delivery_address_snapshot; end if;
  if p_next_status='ready' and nullif(trim(v_address),'') is null then raise exception 'El cliente no tiene dirección de entrega.'; end if;

  if p_next_status='ready' then
    for v_line in select * from public.shipment_lines where shipment_id=p_shipment_id order by id for update loop
      select product_id into v_product_id from public.order_lines where id=v_line.order_line_id;
      if v_product_id is null then raise exception 'Una línea del viaje no tiene producto canónico.'; end if;
      perform 1 from public.products where id=v_product_id for update;
      select available_quantity into v_available from public.stock_balances where product_id=v_product_id;
      if coalesce(v_available,0)<v_line.planned_quantity then raise exception 'Stock listo insuficiente para reservar % unidades de %.',v_line.planned_quantity,v_product_id; end if;
      insert into public.stock_reservations(shipment_line_id,product_id,quantity,responsible,note)
      values(v_line.id,v_product_id,v_line.planned_quantity,coalesce(nullif(trim(p_responsible),''),'Operación'),'Reserva al dejar el viaje pronto');
    end loop;
  elsif p_next_status='cancelled' then
    update public.stock_reservations set status='released',released_at=v_now,note=coalesce(note||' · ','')||'Liberada por cancelación'
    where shipment_line_id in(select id from public.shipment_lines where shipment_id=p_shipment_id) and status='active';
  elsif p_next_status='dispatched' then
    for v_line in select * from public.shipment_lines where shipment_id=p_shipment_id order by id for update loop
      select product_id into v_product_id from public.order_lines where id=v_line.order_line_id;
      if not exists(select 1 from public.stock_reservations where shipment_line_id=v_line.id and status='active' and quantity=v_line.planned_quantity) then raise exception 'La línea % no tiene una reserva activa completa.',v_line.id; end if;
      insert into public.stock_movements(product_id,stock_state,quantity,movement_type,order_line_id,shipment_line_id,remittance,performed_at,responsible,note,transformation_id)
      values(v_product_id,'ready',-v_line.planned_quantity,'dispatch',v_line.order_line_id,v_line.id,coalesce(nullif(trim(p_remittance),''),v_shipment.remittance),v_now,coalesce(nullif(trim(p_responsible),''),'Operación'),'Despacho de viaje '||p_shipment_id,gen_random_uuid());
      update public.stock_reservations set status='consumed',consumed_at=v_now where shipment_line_id=v_line.id and status='active';
    end loop;
  elsif p_next_status='delivered' then
    if jsonb_typeof(p_delivered_lines)<>'array' then raise exception 'Indique las cantidades aceptadas.'; end if;
    for v_item in select * from jsonb_array_elements(p_delivered_lines) loop
      select * into v_line from public.shipment_lines where id=(v_item->>'shipmentLineId')::bigint and shipment_id=p_shipment_id for update;
      if not found or (v_item->>'deliveredQuantity')::integer<0 or (v_item->>'deliveredQuantity')::integer>v_line.planned_quantity then raise exception 'Cantidad entregada inválida.'; end if;
      update public.shipment_lines set delivered_quantity=(v_item->>'deliveredQuantity')::integer where id=v_line.id;
    end loop;
  end if;

  update public.shipments set status=p_next_status,
    remittance=case when p_next_status='cancelled' then remittance else coalesce(nullif(trim(p_remittance),''),remittance) end,
    shared_remittance_reason=coalesce(nullif(trim(p_shared_remittance_reason),''),shared_remittance_reason),
    delivery_address_snapshot=coalesce(v_address,delivery_address_snapshot),
    loaded_at=case when p_next_status='loaded' then v_now else loaded_at end,
    dispatched_at=case when p_next_status='dispatched' then v_now else dispatched_at end,
    delivered_at=case when p_next_status='delivered' then v_now else delivered_at end
  where id=p_shipment_id;
  insert into public.shipment_events(shipment_id,event_type,previous_status,next_status,previous_remittance,next_remittance,responsible)
  values(p_shipment_id,'transition',v_shipment.status,p_next_status,v_shipment.remittance,coalesce(nullif(trim(p_remittance),''),v_shipment.remittance),coalesce(nullif(trim(p_responsible),''),'Operación'));
  perform public.refresh_order_from_shipments(v_shipment.order_id);
  return true;
end; $$;
revoke execute on function public.transition_shipment_v2(bigint,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.transition_shipment_v2(bigint,text,text,text,jsonb,text) to service_role;

create or replace function public.transition_shipment_v1(
  p_shipment_id bigint,p_next_status text,p_remittance text,p_shared_remittance_reason text,p_delivered_lines jsonb,p_responsible text
) returns boolean language sql security invoker set search_path=public as $$
  select public.transition_shipment_v2(p_shipment_id,p_next_status,p_remittance,p_shared_remittance_reason,p_delivered_lines,p_responsible);
$$;

insert into public.clients(id,name,address,department,active)
select 'source-'||lower(regexp_replace(source.name,'[^a-zA-Z0-9]+','-','g')),source.name,null,null,false
from (values('Conaprole'),('Noridel'),('Azucarlito')) source(name)
where not exists(select 1 from public.clients c where lower(c.name)=lower(source.name));

with inputs(source_file,source_sheet,source_catalog,as_of_date,expected_pending,expected_ready,note) as (values
  ('3.0Control Stock Palbin Productos datos ficticios polarist.xlsx','STOCK','Palbin','2026-08-17'::date,2150,2717,'Saldo derivado del libro de movimientos hasta el 17/08/2026.'),
  ('3.1 Control_Stock_PAMER.xlsx','STOCK','Pamer','2026-08-15'::date,271,460,'Saldo derivado del libro de movimientos hasta el 15/08/2026.')
)
insert into public.stock_import_runs(source_file,source_sheet,source_catalog,as_of_date,imported_by,expected_pending,expected_ready,status,note)
select source_file,source_sheet,source_catalog,as_of_date,'Migración etapa 06',expected_pending,expected_ready,'reconciled',note from inputs
on conflict(source_file,source_sheet,as_of_date) do nothing;

with balances(catalog,code,row_number,name,pending,ready) as (values
('Palbin','P01',9,'CRISTAL PET',0,10),('Palbin','P02',10,'PALETS CITRUS (120X100)',210,580),('Palbin','P03',11,'MOLINOS SAN JOSE',0,0),('Palbin','P04',12,'SAINT GOBAIN',0,5),('Palbin','P05',13,'122X102',0,74),('Palbin','P06',14,'REPARADOS',100,0),('Palbin','P07',15,'GRANJA POCHA (punto rojo)',100,232),('Palbin','P08',16,'AZUCARLITO',0,20),('Palbin','P09',17,'PISOS EXPORTACION',704,77),('Palbin','P10',18,'FRICASA (120X100)',0,100),('Palbin','P11',19,'PROQUIMUR (120X100)',300,300),('Palbin','P12',20,'CONAPROLE (120X100)',0,0),('Palbin','P13',21,'120X80',0,0),('Palbin','P14',22,'PISOS CHACRA',125,10),('Palbin','P15',23,'BINS X3 (EXPORTACION)',0,672),('Palbin','P16',24,'BINS X2 (EXPORTACION)',0,398),('Palbin','P17',25,'BINS CHACRA AZUL',0,0),('Palbin','P18',26,'BINS CHACRA BLANCO',0,0),('Palbin','P19',27,'BINS CHACRA ROJO',0,0),('Palbin','P20',28,'BINS CHACRA ANARANJADO',0,0),('Palbin','P21',29,'AFB (120X100)',0,0),('Palbin','P22',30,'AFB (220X117)',40,6),('Palbin','P23',31,'PALLET 120X100 TIPO MSJ MIIRASOL (ARG)',571,188),('Palbin','P24',32,'BINS LIO X3',0,45),('Palbin','P25',33,'PALLET CITRUS 103X121',0,0),('Palbin','P26',34,'PALLET NUM 6 122 X 102',0,0),('Palbin','P27',35,'PALLET MERCOSUR CON CORTE',922,520),('Palbin','P28',36,'PÁLLET MERCOSUR SIN CORTE',0,0),('Palbin','P29',37,'ALUMINOS DEL URUGUAY 120X100',0,0),('Palbin','P30',38,'SAN MIGUEL 113X113',100,187),('Palbin','P31',39,'PALLET 120X130',0,0),('Palbin','P32',40,'PALLET 112X120',0,520),('Palbin','P33',41,'SAN MIGUEL PALLET 116.5X114',0,0),('Palbin','P34',42,'SAN MIGUEL 120X120',0,0),('Palbin','P35',43,'SAN MIGUEL 120X120 reforzado',0,0),('Palbin','P36',44,'PALLET PREINCO 120X100',0,0),('Palbin','P37',45,'BINS CHACRA CHAPICUY',0,0),('Palbin','P38',46,'PALLET 220X120 MSJ',27,0),('Palbin','P39',47,'AVANTI 120x100',0,0),
('Pamer','P01',9,'100x80 ABIERTAS',0,0),('Pamer','P02',10,'100x100 ABIERTAS',1,0),('Pamer','P03',11,'100x120 MERCOSUR LIVIANO',0,0),('Pamer','P04',12,'120x100 ADIUM REF',60,240),('Pamer','P05',13,'120x80 ABIERTAS',0,0),('Pamer','P06',14,'120x80 CERRADAS',0,0),('Pamer','P07',15,'120x90 CERRADAS',0,60),('Pamer','P08',16,'120x100 ABIERTAS',0,0),('Pamer','P09',17,'120x100 CERRADAS',0,0),('Pamer','P10',18,'120x120 CERRADAS',0,0),('Pamer','P11',19,'120x120 ABIERTAS',0,0),('Pamer','P12',20,'130x90 CERRADAS',0,0),('Pamer','P13',21,'140x120 ABIERTAS',0,0),('Pamer','P14',22,'140x120 CERRADAS',0,0),('Pamer','P15',23,'145x80 ABIERTAS REF',0,110),('Pamer','P16',24,'145x100 ABIERTAS',0,0),('Pamer','P17',25,'145x100 CERRADAS',0,50),('Pamer','P18',26,'155x70 ABIERTAS',0,0),('Pamer','P19',27,'160x80 ABIERTAS',0,0),('Pamer','P20',28,'160x110 SIMPLES REFORZADAS',140,0),('Pamer','P21',29,'216x110 SIMPLES REFORZADAS',70,0),('Pamer','P22',30,'130X120',0,0)
), rows_to_insert as (
select r.id run_id,b.row_number,b.code,b.name,p.id product_id,b.pending,b.ready
from balances b join public.stock_import_runs r on r.source_catalog=b.catalog and r.source_sheet='STOCK'
join public.products p on p.source_catalog=b.catalog and p.source_code=b.code
)
insert into public.stock_import_rows(import_run_id,source_row,source_code,source_name,product_id,pending_quantity,ready_quantity,mapping_status,mapping_note)
select run_id,row_number,code,name,product_id,pending,ready,'mapped',case when pending>0 and not (select requires_treatment from public.products where id=product_id) then 'La fuente ubica unidades en pendiente aunque el producto figura sin tratamiento; se preservó el saldo para revisión.' end
from rows_to_insert on conflict(import_run_id,source_row) do nothing;

insert into public.stock_movements(product_id,stock_state,quantity,movement_type,import_row_id,source_reference,performed_at,responsible,note,transformation_id)
select ir.product_id,state.stock_state,state.quantity,'opening_balance',ir.id,
  'opening:'||run.source_catalog||':'||ir.source_code||':'||state.stock_state,
  run.as_of_date::timestamptz,'Migración etapa 06',coalesce(ir.mapping_note,'Saldo inicial reconciliado con hoja STOCK'),gen_random_uuid()
from public.stock_import_rows ir join public.stock_import_runs run on run.id=ir.import_run_id
cross join lateral (values('pending_treatment',ir.pending_quantity),('ready',ir.ready_quantity)) state(stock_state,quantity)
where ir.mapping_status='mapped' and state.quantity>0
on conflict(import_row_id,stock_state) where movement_type='opening_balance' do nothing;

with source_rules(client_name,product_id,daily,workdays,safety,note) as (values
('Frutura','palbin-p05',300::numeric,6,0,'Pallets 1,22×1,02 HT; confirmado por Gabriel.'),
('Frutura','palbin-p02',300::numeric,6,0,'Pallets 1,20×1,00 HT; consumo compartido con 122×102.'),
('Conaprole','palbin-p27',630::numeric,5,0,'Pallets Manteca 1,20×1,00 HT; entrega fija 630 por viaje.'),
('Noridel','palbin-p05',200::numeric,6,0,'Pallets 1,22×1,02 HT.'),
('Noridel','palbin-p02',200::numeric,6,0,'Pallets 1,20×1,00 HT.'),
('Azucarlito','palbin-p27',200::numeric,7,1000,'Pallets Mercosur 1,20×1,00 sin HT; reserva informada 1.000.'),
('Proquimur','palbin-p11',300::numeric,6,600,'Pallets 1,20×1,00 HT; reserva 300 interno + 300 exportación.')
)
insert into public.client_product_consumption(client_id,product_id,daily_consumption,workdays_per_week,safety_stock,valid_from,source,note)
select c.id,s.product_id,s.daily,s.workdays,s.safety,'2026-06-11','4 -Control de quiebre de Stock.xlsx · Consumo por Cliente',s.note
from source_rules s join public.clients c on lower(c.name)=lower(s.client_name)
where not exists(select 1 from public.client_product_consumption existing where existing.client_id=c.id and existing.product_id=s.product_id and existing.valid_from='2026-06-11');

notify pgrst,'reload schema';
