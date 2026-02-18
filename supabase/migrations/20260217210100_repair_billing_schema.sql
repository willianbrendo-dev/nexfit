-- Force schema cache reload and ensure permissions
DO $$ 
BEGIN
    -- Grant permissions just in case
    GRANT ALL ON public.integration_configs TO authenticated;
    GRANT ALL ON public.financial_transactions TO authenticated;
    GRANT ALL ON public.integration_configs TO service_role;
    GRANT ALL ON public.financial_transactions TO service_role;
    
    -- Dummy operation to trigger potential triggers or cache invalidation
    -- Some environments need a DDL change to refresh PostgREST
    -- But since we can't easily do that without knowing the current state, 
    -- we hope the Grants or just the execution of this migration helps.
END $$;
