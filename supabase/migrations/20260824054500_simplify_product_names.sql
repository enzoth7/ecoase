update public.products
set
  name = case
    when catalog = 'Pamer' then 'Pallet'
    when id in ('palbin-p05', 'palbin-p13', 'palbin-p31', 'palbin-p32') then 'Pallet'
    else name
  end,
  specification = null,
  updated_at = now();
