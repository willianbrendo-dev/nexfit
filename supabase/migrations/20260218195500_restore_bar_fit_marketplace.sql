-- Reconstruct missing marketplace_stores record for 'BAR FIT'
-- It likely failed to create due to the previous constraint violation.

DO $$
DECLARE
    v_user_id uuid;
    v_store_id uuid;
    v_store_name text;
    v_store_desc text;
BEGIN
    -- 1. Find the User ID owning 'BAR FIT' from the internal 'stores' table
    SELECT su.user_id, s.id, s.name, s.description
    INTO v_user_id, v_store_id, v_store_name, v_store_desc
    FROM public.stores s
    JOIN public.store_users su ON s.id = su.store_id
    WHERE s.name ILIKE '%BAR FIT%'
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- 2. Check if marketplace_store already exists (to prevent duplicates if it actually exists)
        IF NOT EXISTS (SELECT 1 FROM public.marketplace_stores WHERE owner_user_id = v_user_id) THEN
            -- 3. Insert into marketplace_stores
            INSERT INTO public.marketplace_stores (
                id,
                owner_user_id,
                nome,
                descricao,
                store_type,
                status,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                v_user_id,
                v_store_name, -- Use the name found in stores table
                v_store_desc,
                'nutricao',   -- Force the correct type requested by user
                'aprovado',
                now(),
                now()
            );
            RAISE NOTICE 'Restored marketplace_stores record for BAR FIT';
        ELSE
             -- If it exists, make sure type is updated
             UPDATE public.marketplace_stores
             SET store_type = 'nutricao'
             WHERE owner_user_id = v_user_id;
             RAISE NOTICE 'Updated existing BAR FIT record to nutricao';
        END IF;
    ELSE
        RAISE NOTICE 'Could not find store BAR FIT in stores table';
    END IF;
END $$;
