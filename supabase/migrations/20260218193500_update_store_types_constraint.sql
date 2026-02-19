-- Update store_type constraint on marketplace_stores
-- Valid values: 'suplementos', 'roupas', 'artigos', 'nutricao' (for 'Comida Fitness')

ALTER TABLE public.marketplace_stores 
DROP CONSTRAINT IF EXISTS marketplace_stores_store_type_check;

ALTER TABLE public.marketplace_stores 
ADD CONSTRAINT marketplace_stores_store_type_check 
CHECK (store_type IN ('suplementos', 'roupas', 'artigos', 'nutricao', 'artigos_esportivos', 'equipamentos', 'servicos'));
