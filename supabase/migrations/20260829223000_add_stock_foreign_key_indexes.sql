create index if not exists stock_import_rows_product_id_idx
  on public.stock_import_rows (product_id);

create index if not exists stock_movements_client_id_idx
  on public.stock_movements (client_id);

create index if not exists stock_movements_order_line_id_idx
  on public.stock_movements (order_line_id);

create index if not exists stock_movements_provider_id_idx
  on public.stock_movements (provider_id);
