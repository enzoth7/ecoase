-- Dotación ficticia para probar la lectura operativa de la vista semanal.
-- Se limita a las reglas demo y puede reemplazarse desde Configuración.
update public.production_capacity_rules rule
set people_count = case resource.name
  when 'Mirasol' then 2
  when 'Blanc' then 1
end,
configuration_label = case resource.name
  when 'Mirasol' then 'Equipo tercerizado ×2'
  when 'Blanc' then 'Equipo tercerizado ×1'
end
from public.production_resources resource
where resource.id = rule.resource_id
  and rule.source = 'demo_ecoase'
  and resource.name in ('Mirasol', 'Blanc')
  and rule.people_count is null;
