-- Logo propio es un nivel opcional, editable desde Niveles y situado después de Tratamiento.
insert into public.product_levels (id, label, position, options, system)
select 'logo-propio', 'Logo propio', tratamiento.position + 1,
       '["A", "Crufi", "MSJ"]'::jsonb, false
from public.product_levels as tratamiento
where tratamiento.id = 'tratamiento'
  and not exists (select 1 from public.product_levels where id = 'logo-propio');
