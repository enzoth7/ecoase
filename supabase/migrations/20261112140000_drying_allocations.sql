-- Cantidades de secadero por día y línea de pedido (programación del secadero día por día).
-- Reconstruida a partir de la tabla real de Supabase, que ya existe; es idempotente.
create table if not exists public.drying_allocations (
  id bigint generated always as identity primary key,
  order_line_id text not null references public.order_lines(id) on delete cascade,
  planned_date date not null,
  planned_quantity integer not null check (planned_quantity > 0),
  created_at timestamptz not null default now(),
  unique (order_line_id, planned_date)
);

create index if not exists drying_allocations_order_line_idx on public.drying_allocations(order_line_id);

alter table public.drying_allocations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'drying_allocations' and policyname = 'drying_allocations_public_read') then
    create policy drying_allocations_public_read on public.drying_allocations for select using (true);
  end if;
end $$;
