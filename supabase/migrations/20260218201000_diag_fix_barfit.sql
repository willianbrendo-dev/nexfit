-- Diagnostic and Force-Fix for BAR FIT
DO $$
DECLARE
    v_user_id uuid;
    v_profile_role text;
    v_store_id uuid;
    v_mk_store_id uuid;
BEGIN
    -- 1. Find the User ID by Email
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'barfit@nexfit.com';
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'USER NOT FOUND in auth.users for barfit@nexfit.com';
        RETURN;
    END IF;

    RAISE NOTICE 'User ID found: %', v_user_id;

    -- 2. Check Profile
    SELECT role INTO v_profile_role FROM public.profiles WHERE id = v_user_id;
    RAISE NOTICE 'Profile role: %', v_profile_role;

    -- 3. Check internal stores link
    SELECT store_id INTO v_store_id FROM public.profiles WHERE id = v_user_id;
    RAISE NOTICE 'Profile store_id: %', v_store_id;

    -- 4. Check marketplace_stores
    SELECT id INTO v_mk_store_id FROM public.marketplace_stores WHERE owner_user_id = v_user_id;
    RAISE NOTICE 'Marketplace store ID: %', v_mk_store_id;

    -- FORCE FIX IF MISSING
    IF v_mk_store_id IS NULL THEN
        RAISE NOTICE 'FORCING creation of marketplace_stores record...';
        INSERT INTO public.marketplace_stores (
            id,
            owner_user_id,
            nome,
            store_type,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            'BAR FIT',
            'nutricao',
            'aprovado',
            now(),
            now()
        );
    ELSE
        RAISE NOTICE 'Updating existing marketplace_stores record...';
        UPDATE public.marketplace_stores 
        SET store_type = 'nutricao', status = 'aprovado' 
        WHERE id = v_mk_store_id;
    END IF;

    -- ENSURE ROLE IS CORRECT
    UPDATE public.profiles SET role = 'store_owner' WHERE id = v_user_id;
    
    -- ENSURE user_roles IS CORRECT
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'store_owner') THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'store_owner');
    END IF;

END $$;
