-- ==========================================
-- REPAIR DATABASE SCRIPT
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Create or Repair professional_hires table
DO $$ 
BEGIN
    -- Ensure columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professional_hires' AND column_name = 'paid_amount') THEN
        ALTER TABLE public.professional_hires ADD COLUMN paid_amount DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professional_hires' AND column_name = 'platform_fee') THEN
        ALTER TABLE public.professional_hires ADD COLUMN platform_fee DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professional_hires' AND column_name = 'is_paid') THEN
        ALTER TABLE public.professional_hires ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professional_hires' AND column_name = 'pix_id') THEN
        ALTER TABLE public.professional_hires ADD COLUMN pix_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professional_hires' AND column_name = 'payment_status') THEN
        ALTER TABLE public.professional_hires ADD COLUMN payment_status TEXT DEFAULT 'pending';
    END IF;
END $$;

-- 2. Ensure Billing module tables
CREATE TABLE IF NOT EXISTS public.integration_configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_secret BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents BIGINT NOT NULL,
    description TEXT,
    category TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Update professionals table for balance
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professionals' AND column_name = 'balance') THEN
        ALTER TABLE professionals ADD COLUMN balance DECIMAL(10,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professionals' AND column_name = 'pix_key') THEN
        ALTER TABLE professionals ADD COLUMN pix_key TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professionals' AND column_name = 'pix_receiver_name') THEN
        ALTER TABLE professionals ADD COLUMN pix_receiver_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professionals' AND column_name = 'pix_bank_name') THEN
        ALTER TABLE professionals ADD COLUMN pix_bank_name TEXT;
    END IF;
END $$;

-- 4. Set Permissions
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_hires ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.integration_configs TO authenticated;
GRANT ALL ON public.financial_transactions TO authenticated;
GRANT ALL ON public.professional_hires TO authenticated;

-- 5. Force Schema Refresh (PostgREST)
-- Note: This is a best effort. If columns still don't show, click "Reload Schema" in Supabase settings.
NOTIFY pgrst, 'reload schema';
