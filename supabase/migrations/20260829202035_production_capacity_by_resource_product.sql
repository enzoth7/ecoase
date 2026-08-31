create extension if not exists btree_gist with schema extensions;

create table public.production_resources (
  id bigint generated always as identity primary key,
  name text not null,
  resource_type text not null check (resource_type in ('internal_factory','internal_crew','external_supplier')),
  provider_id text references public.providers(id) on delete restrict,
  active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((resource_type = 'external_supplier') = (provider_id is not null)),
  check (nullif(trim(name), '') is not null)
);

create unique index production_resources_active_name_idx
  on public.production_resources(lower(trim(name))) where active;
create unique index production_resources_active_provider_idx
  on public.production_resources(provider_id) where active and provider_id is not null;
create index production_resources_type_order_idx
  on public.production_resources(resource_type, active desc, display_order, id);

create table public.production_capacity_rules (
  id bigint generated always as identity primary key,
  resource_id bigint not null references public.production_resources(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  people_count integer check (people_count is null or people_count > 0),
  configuration_label text not null check (nullif(trim(configuration_label), '') is not null),
  normal_units_per_day integer not null check (normal_units_per_day > 0),
  maximum_units_per_day integer not null check (maximum_units_per_day >= normal_units_per_day),
  valid_from date not null,
  valid_to date,
  source text not null default 'manual' check (nullif(trim(source), '') is not null),
  note text,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  exclude using gist (
    resource_id with =,
    product_id with =,
    (coalesce(people_count, 0)) with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  )
);

create index production_capacity_rules_resource_date_idx
  on public.production_capacity_rules(resource_id, valid_from, valid_to);
create index production_capacity_rules_product_date_idx
  on public.production_capacity_rules(product_id, valid_from, valid_to);

create table public.production_daily_overrides (
  id bigint generated always as identity primary key,
  override_date date not null,
  resource_id bigint not null references public.production_resources(id) on delete restrict,
  capacity_rule_id bigint references public.production_capacity_rules(id) on delete restrict,
  product_id text references public.products(id) on delete restrict,
  normal_units_per_day integer check (normal_units_per_day is null or normal_units_per_day > 0),
  maximum_units_per_day integer,
  available boolean not null default true,
  external_status text check (external_status is null or external_status in ('estimated','confirmed')),
  reason text not null check (nullif(trim(reason), '') is not null),
  responsible text not null check (nullif(trim(responsible), '') is not null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (maximum_units_per_day is null or maximum_units_per_day > 0),
  check (normal_units_per_day is null or maximum_units_per_day is null or maximum_units_per_day >= normal_units_per_day),
  check (normal_units_per_day is null or capacity_rule_id is not null or product_id is not null),
  check (maximum_units_per_day is null or capacity_rule_id is not null or product_id is not null)
);

create unique index production_daily_overrides_scope_idx
  on public.production_daily_overrides(
    override_date,
    resource_id,
    coalesce(capacity_rule_id, 0),
    coalesce(product_id, '')
  );
create index production_daily_overrides_date_resource_idx
  on public.production_daily_overrides(override_date, resource_id);

alter table public.production_allocations
  add column production_resource_id bigint references public.production_resources(id) on delete restrict,
  add column capacity_rule_id bigint references public.production_capacity_rules(id) on delete restrict,
  add column actual_quantity integer check (actual_quantity is null or actual_quantity >= 0),
  add column completed_at timestamptz,
  add column completion_note text;

create index production_allocations_resource_date_idx
  on public.production_allocations(production_resource_id, planned_date, status)
  where status <> 'cancelled';
create index production_allocations_rule_idx
  on public.production_allocations(capacity_rule_id) where capacity_rule_id is not null;

alter table public.production_allocations
  add constraint production_allocations_capacity_evidence_check
    check (status not in ('confirmed','completed') or (production_resource_id is not null and capacity_rule_id is not null)),
  add constraint production_allocations_completion_check
    check (status <> 'completed' or (actual_quantity is not null and actual_quantity <= planned_quantity and completed_at is not null));

create trigger production_resources_set_updated_at before update on public.production_resources
for each row execute function public.set_client_master_updated_at();
create trigger production_daily_overrides_set_updated_at before update on public.production_daily_overrides
for each row execute function public.set_client_master_updated_at();

alter table public.production_resources enable row level security;
alter table public.production_capacity_rules enable row level security;
alter table public.production_daily_overrides enable row level security;

create policy production_resources_public_read on public.production_resources
  for select to anon, authenticated using (true);
create policy production_capacity_rules_public_read on public.production_capacity_rules
  for select to anon, authenticated using (true);
create policy production_daily_overrides_public_read on public.production_daily_overrides
  for select to anon, authenticated using (true);

grant select on public.production_resources, public.production_capacity_rules, public.production_daily_overrides to anon, authenticated;
grant select, insert, update on public.production_resources, public.production_capacity_rules, public.production_daily_overrides to service_role;
grant usage, select on sequence public.production_resources_id_seq, public.production_capacity_rules_id_seq, public.production_daily_overrides_id_seq to service_role;

insert into public.production_resources(name, resource_type, display_order)
select 'Fábrica', 'internal_factory', 10
where not exists (select 1 from public.production_resources where lower(name) = 'fábrica' and active);

insert into public.production_resources(name, resource_type, provider_id, display_order)
select p.name, 'external_supplier', p.id,
  case lower(p.name) when 'mirasol' then 20 when 'blanc' then 30 else 100 end
from public.providers p
where p.type = 'Aserradero'
  and lower(p.name) in ('mirasol','blanc')
  and not exists (select 1 from public.production_resources r where r.provider_id = p.id and r.active);

with unique_matches as (
  select ol.id as order_line_id, min(p.id) as product_id
  from public.order_lines ol
  join public.products p
    on lower(trim(ol.product)) = lower(trim(concat_ws(' ', p.kind, p.measure)))
  where ol.product_id is null
  group by ol.id
  having count(*) = 1
)
update public.order_lines ol set product_id = matches.product_id
from unique_matches matches where ol.id = matches.order_line_id;

update public.production_allocations pa
set production_resource_id = r.id
from public.production_resources r
where pa.production_resource_id is null
  and (
    (pa.resource_id = 'internal' and r.resource_type = 'internal_factory')
    or pa.resource_id = r.provider_id
  );

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
      new.note := concat_ws(' · ', nullif(trim(new.note), ''), 'Pendiente de confirmar capacidad');
    else
      raise exception 'La asignación necesita recurso y regla de capacidad para confirmarse.';
    end if;
  end if;
  if new.status = 'completed' and (new.production_resource_id is null or new.capacity_rule_id is null) then
    raise exception 'La asignación necesita evidencia de capacidad para completarse.';
  end if;
  return new;
end; $$;
revoke execute on function public.guard_production_allocation_capacity_v1() from public, anon, authenticated;
create trigger production_allocations_capacity_guard
before insert or update on public.production_allocations
for each row execute function public.guard_production_allocation_capacity_v1();

create or replace function public.upsert_production_daily_override_v1(
  p_date date,
  p_resource_id bigint,
  p_capacity_rule_id bigint,
  p_product_id text,
  p_normal_units integer,
  p_maximum_units integer,
  p_available boolean,
  p_external_status text,
  p_reason text,
  p_responsible text
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint; v_resource public.production_resources%rowtype; v_rule public.production_capacity_rules%rowtype;
begin
  select * into v_resource from public.production_resources where id = p_resource_id;
  if not found then raise exception 'Recurso no encontrado.'; end if;
  if p_date is null or nullif(trim(p_reason), '') is null or nullif(trim(p_responsible), '') is null then
    raise exception 'Fecha, motivo y responsable son obligatorios.';
  end if;
  if p_external_status is not null and (v_resource.resource_type <> 'external_supplier' or p_external_status not in ('estimated','confirmed')) then
    raise exception 'El estado estimado/confirmado solo corresponde a un proveedor externo.';
  end if;
  if p_capacity_rule_id is not null then
    select * into v_rule from public.production_capacity_rules where id = p_capacity_rule_id;
    if not found or v_rule.resource_id <> p_resource_id then raise exception 'La regla no corresponde al recurso.'; end if;
    if p_product_id is not null and p_product_id <> v_rule.product_id then raise exception 'El producto no corresponde a la regla.'; end if;
  end if;
  if p_normal_units is not null and p_normal_units <= 0 then raise exception 'La capacidad normal debe ser mayor a cero.'; end if;
  if p_maximum_units is not null and (p_maximum_units <= 0 or p_normal_units is not null and p_maximum_units < p_normal_units) then
    raise exception 'La capacidad máxima debe ser mayor o igual a la normal.';
  end if;
  insert into public.production_daily_overrides(
    override_date, resource_id, capacity_rule_id, product_id, normal_units_per_day,
    maximum_units_per_day, available, external_status, reason, responsible
  ) values (
    p_date, p_resource_id, p_capacity_rule_id, p_product_id, p_normal_units,
    p_maximum_units, coalesce(p_available, true), p_external_status, trim(p_reason), trim(p_responsible)
  )
  on conflict (
    override_date,
    resource_id,
    (coalesce(capacity_rule_id, 0)),
    (coalesce(product_id, ''))
  ) do update set
    normal_units_per_day = excluded.normal_units_per_day,
    maximum_units_per_day = excluded.maximum_units_per_day,
    available = excluded.available,
    external_status = excluded.external_status,
    reason = excluded.reason,
    responsible = excluded.responsible,
    updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.confirm_production_allocation_v1(
  p_allocation_id bigint,
  p_resource_id bigint,
  p_capacity_rule_id bigint,
  p_overload_note text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_allocation public.production_allocations%rowtype;
  v_rule public.production_capacity_rules%rowtype;
  v_product_id text;
  v_normal numeric;
  v_maximum numeric;
  v_normal_load numeric := 0;
  v_maximum_load numeric := 0;
  v_other record;
  v_other_normal numeric;
  v_other_maximum numeric;
  v_provider_id text;
begin
  select * into v_allocation from public.production_allocations where id = p_allocation_id for update;
  if not found then raise exception 'Asignación no encontrada.'; end if;
  if v_allocation.status <> 'draft' then raise exception 'Solo se confirman asignaciones en borrador.'; end if;
  select product_id into v_product_id from public.order_lines where id = v_allocation.order_line_id;
  if v_product_id is null then raise exception 'La línea no está vinculada a un producto del maestro.'; end if;
  select * into v_rule from public.production_capacity_rules where id = p_capacity_rule_id;
  if not found or v_rule.resource_id <> p_resource_id or v_rule.product_id <> v_product_id
    or v_rule.valid_from > v_allocation.planned_date
    or (v_rule.valid_to is not null and v_rule.valid_to < v_allocation.planned_date) then
    raise exception 'Seleccione una regla vigente para el recurso y producto.';
  end if;
  if exists (
    select 1 from public.production_daily_overrides
    where override_date = v_allocation.planned_date and resource_id = p_resource_id and available = false
  ) then raise exception 'El recurso no está disponible en esa fecha.'; end if;

  select
    coalesce(o.normal_units_per_day, v_rule.normal_units_per_day),
    coalesce(o.maximum_units_per_day, v_rule.maximum_units_per_day)
  into v_normal, v_maximum
  from (select 1) seed
  left join lateral (
    select d.normal_units_per_day, d.maximum_units_per_day
    from public.production_daily_overrides d
    where d.override_date = v_allocation.planned_date and d.resource_id = p_resource_id
      and (d.capacity_rule_id = v_rule.id or (d.capacity_rule_id is null and d.product_id = v_rule.product_id))
    order by (d.capacity_rule_id = v_rule.id) desc, d.id desc limit 1
  ) o on true;

  for v_other in
    select pa.*, r.normal_units_per_day as rule_normal, r.maximum_units_per_day as rule_maximum, r.product_id
    from public.production_allocations pa
    join public.production_capacity_rules r on r.id = pa.capacity_rule_id
    where pa.production_resource_id = p_resource_id
      and pa.planned_date = v_allocation.planned_date
      and pa.status in ('confirmed','completed')
      and pa.id <> v_allocation.id
  loop
    select
      coalesce(o.normal_units_per_day, v_other.rule_normal),
      coalesce(o.maximum_units_per_day, v_other.rule_maximum)
    into v_other_normal, v_other_maximum
    from (select 1) seed
    left join lateral (
      select d.normal_units_per_day, d.maximum_units_per_day
      from public.production_daily_overrides d
      where d.override_date = v_allocation.planned_date and d.resource_id = p_resource_id
        and (d.capacity_rule_id = v_other.capacity_rule_id or (d.capacity_rule_id is null and d.product_id = v_other.product_id))
      order by (d.capacity_rule_id = v_other.capacity_rule_id) desc, d.id desc limit 1
    ) o on true;
    v_normal_load := v_normal_load + coalesce(v_other.actual_quantity, v_other.planned_quantity)::numeric / v_other_normal;
    v_maximum_load := v_maximum_load + coalesce(v_other.actual_quantity, v_other.planned_quantity)::numeric / v_other_maximum;
  end loop;

  v_normal_load := v_normal_load + v_allocation.planned_quantity::numeric / v_normal;
  v_maximum_load := v_maximum_load + v_allocation.planned_quantity::numeric / v_maximum;
  if v_maximum_load > 1.0000001 then raise exception 'La asignación supera la capacidad máxima del recurso.'; end if;
  if v_normal_load > 1.0000001 and nullif(trim(p_overload_note), '') is null then
    raise exception 'Indique una nota para confirmar por encima de la capacidad normal.';
  end if;
  select provider_id into v_provider_id from public.production_resources where id = p_resource_id;
  update public.production_allocations set
    production_resource_id = p_resource_id,
    resource_id = coalesce(v_provider_id, case when p_resource_id = (select id from public.production_resources where resource_type = 'internal_factory' and active order by display_order limit 1) then 'internal' else p_resource_id::text end),
    capacity_rule_id = p_capacity_rule_id,
    status = 'confirmed',
    note = coalesce(nullif(trim(p_overload_note), ''), note)
  where id = p_allocation_id;
  return true;
end; $$;

create or replace function public.complete_production_allocation_v1(
  p_allocation_id bigint,
  p_actual_quantity integer,
  p_completion_note text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_allocation public.production_allocations%rowtype;
begin
  select * into v_allocation from public.production_allocations where id = p_allocation_id for update;
  if not found then raise exception 'Asignación no encontrada.'; end if;
  if v_allocation.status <> 'confirmed' then raise exception 'Solo se completan asignaciones confirmadas.'; end if;
  if p_actual_quantity is null or p_actual_quantity < 0 or p_actual_quantity > v_allocation.planned_quantity then
    raise exception 'La cantidad real debe estar entre cero y la cantidad planificada.';
  end if;
  if p_actual_quantity <> v_allocation.planned_quantity and nullif(trim(p_completion_note), '') is null then
    raise exception 'Explique la diferencia entre lo planificado y lo producido.';
  end if;
  update public.production_allocations set
    actual_quantity = p_actual_quantity,
    completed_at = now(),
    completion_note = nullif(trim(p_completion_note), ''),
    status = 'completed'
  where id = p_allocation_id;
  return true;
end; $$;

revoke execute on function public.upsert_production_daily_override_v1(date,bigint,bigint,text,integer,integer,boolean,text,text,text) from public, anon, authenticated;
revoke execute on function public.confirm_production_allocation_v1(bigint,bigint,bigint,text) from public, anon, authenticated;
revoke execute on function public.complete_production_allocation_v1(bigint,integer,text) from public, anon, authenticated;
grant execute on function public.upsert_production_daily_override_v1(date,bigint,bigint,text,integer,integer,boolean,text,text,text) to service_role;
grant execute on function public.confirm_production_allocation_v1(bigint,bigint,bigint,text) to service_role;
grant execute on function public.complete_production_allocation_v1(bigint,integer,text) to service_role;

create or replace function public.replace_production_allocations_v1(p_order_line_id text, p_allocations jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_line public.order_lines%rowtype;
  v_item jsonb;
  v_total integer := 0;
  v_fixed integer;
  v_legacy_resource text;
  v_production_resource bigint;
begin
  select * into v_line from public.order_lines where id = p_order_line_id for update;
  if not found then raise exception 'Línea no encontrada.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'Formato de asignaciones inválido.'; end if;
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
  return true;
end; $$;
revoke execute on function public.replace_production_allocations_v1(text,jsonb) from public, anon, authenticated;
grant execute on function public.replace_production_allocations_v1(text,jsonb) to service_role;
