create table public.internal_team_capacity (
  id boolean primary key default true check (id),
  available_people integer not null check (available_people >= 0),
  updated_at timestamptz not null default now()
);

alter table public.internal_team_capacity enable row level security;
create policy internal_team_capacity_public_read on public.internal_team_capacity for select to anon, authenticated using (true);
grant select on public.internal_team_capacity to anon, authenticated;

create function public.upsert_internal_team_capacity(p_available_people integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_available_people < 0 then raise exception 'La dotación disponible no puede ser negativa.'; end if;
  insert into public.internal_team_capacity(id, available_people) values (true, p_available_people)
  on conflict (id) do update set available_people = excluded.available_people, updated_at = now();
  return true;
end; $$;

revoke all on function public.upsert_internal_team_capacity(integer) from public;
grant execute on function public.upsert_internal_team_capacity(integer) to anon, authenticated;
