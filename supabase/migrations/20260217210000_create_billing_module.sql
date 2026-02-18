-- Create integration_configs table for managing API keys dynamically
CREATE TABLE IF NOT EXISTS public.integration_configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_secret BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for integration_configs
CREATE INDEX IF NOT EXISTS integration_configs_key_idx ON public.integration_configs(key);

-- Create financial_transactions table for billing tracking
CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents BIGINT NOT NULL,
    description TEXT,
    category TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id UUID, -- Reference to a payment or other entity
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for financial_transactions
CREATE INDEX IF NOT EXISTS financial_transactions_date_idx ON public.financial_transactions(date);
CREATE INDEX IF NOT EXISTS financial_transactions_type_idx ON public.financial_transactions(type);

-- Enable RLS
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- Policies (Admins only)
CREATE POLICY "Admins can manage integration_configs"
    ON public.integration_configs
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'master' OR email = 'biotreinerapp@gmail.com')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'master' OR email = 'biotreinerapp@gmail.com')));

CREATE POLICY "Admins can manage financial_transactions"
    ON public.financial_transactions
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'master' OR email = 'biotreinerapp@gmail.com')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'master' OR email = 'biotreinerapp@gmail.com')));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_integration_configs_updated_at
    BEFORE UPDATE ON public.integration_configs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_financial_transactions_updated_at
    BEFORE UPDATE ON public.financial_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
