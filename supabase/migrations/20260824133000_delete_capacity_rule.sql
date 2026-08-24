create or replace function public.delete_capacity_rule(p_operation text, p_people_count integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  if p_operation not in ('assembly', 'marking', 'ht') or p_people_count < 0 then
    raise exception 'Regla de capacidad inválida.';
  end if;
  delete from public.capacity_rules
  where operation = p_operation and people_count = p_people_count;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end; $$;

revoke all on function public.delete_capacity_rule(text, integer) from public;
grant execute on function public.delete_capacity_rule(text, integer) to anon, authenticated;
