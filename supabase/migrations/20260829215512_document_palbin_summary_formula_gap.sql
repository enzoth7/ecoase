alter table public.stock_import_runs
  add column source_reported_pending integer,
  add column source_reported_ready integer;

update public.stock_import_runs set
  source_reported_pending=2150,
  source_reported_ready=2717,
  expected_pending=3199,
  expected_ready=3944,
  note='El detalle por producto de STOCK suma 3.199 pendientes y 3.944 listas. El resumen visible informa 2.150 y 2.717 porque sus fórmulas solo incluyen C9:C33 / D9:D33 y omiten las filas 34:47; se importó el detalle completo.'
where source_catalog='Palbin';

update public.stock_import_runs set
  source_reported_pending=271,
  source_reported_ready=460
where source_catalog='Pamer';

notify pgrst,'reload schema';
