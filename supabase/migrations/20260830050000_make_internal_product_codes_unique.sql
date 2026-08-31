-- El código interno identifica un producto en toda la operación, no solo
-- dentro de su catálogo de origen. Palbin conserva P01–P39 y Pamer pasa a
-- ocupar P40–P61. Los IDs no cambian, por lo que se preservan pedidos,
-- movimientos de stock, relaciones cliente-producto y las referencias
-- históricas de las planillas importadas.
update public.products product
set source_code = 'P' || lpad((39 + (substring(product.id from '(\d+)$'))::integer)::text, 2, '0')
where product.source_catalog = 'Pamer'
  and product.id ~ '^pamer-p\d+$';

create unique index if not exists products_internal_code_unique
  on public.products (upper(trim(source_code)))
  where nullif(trim(source_code), '') is not null;

notify pgrst, 'reload schema';
