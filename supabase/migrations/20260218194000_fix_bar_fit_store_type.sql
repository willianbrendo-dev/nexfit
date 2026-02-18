-- Manually update store 'BAR FIT' to 'nutricao'
UPDATE public.marketplace_stores
SET store_type = 'nutricao'
WHERE nome ILIKE '%BAR FIT%';
