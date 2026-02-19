-- DEFINITIVE FIX FOR STORE CONSTRAINTS AND BAR FIT LINKING

-- 1. Fix the constraint on marketplace_stores
ALTER TABLE public.marketplace_stores 
DROP CONSTRAINT IF EXISTS marketplace_stores_store_type_check;

ALTER TABLE public.marketplace_stores 
ADD CONSTRAINT marketplace_stores_store_type_check 
CHECK (store_type IN ('suplementos', 'roupas', 'artigos', 'nutricao', 'artigos_esportivos'));

-- 2. Link BAR FIT manually
INSERT INTO public.marketplace_stores (
    id,
    owner_user_id,
    nome,
    store_type,
    status,
    desconto_percent,
    subscription_plan,
    shipping_cost
) VALUES (
    'eb5b4727-748d-49c3-8d84-884d7f0f4a77', -- ID da store interna
    '85152abd-8bc6-4b68-abc4-003d072342e3', -- ID do usuário (barfit@nexfit.com)
    'BAR FIT',
    'nutricao',
    'aprovado',
    10,
    'FREE',
    0
) ON CONFLICT (id) DO UPDATE SET 
    owner_user_id = EXCLUDED.owner_user_id,
    nome = EXCLUDED.nome,
    store_type = EXCLUDED.store_type,
    status = EXCLUDED.status;

-- 3. Ensure the user has the correct role and is linked in profiles
UPDATE public.profiles 
SET role = 'store_owner', 
    store_id = 'eb5b4727-748d-49c3-8d84-884d7f0f4a77',
    onboarding_completed = true
WHERE id = '85152abd-8bc6-4b68-abc4-003d072342e3';

INSERT INTO public.user_roles (user_id, role) 
VALUES ('85152abd-8bc6-4b68-abc4-003d072342e3', 'store_owner')
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Ensure the legacy "lojas" table is also in sync
INSERT INTO public.lojas (
    user_id,
    nome_loja,
    status
) VALUES (
    '85152abd-8bc6-4b68-abc4-003d072342e3',
    'BAR FIT',
    'aprovado'
) ON CONFLICT (user_id) DO UPDATE SET
    nome_loja = EXCLUDED.nome_loja,
    status = EXCLUDED.status;
