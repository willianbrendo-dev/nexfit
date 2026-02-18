-- ==========================================
-- FINANCIAL AND PRICING SCHEMA UPDATES
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Create access_modules table
CREATE TABLE IF NOT EXISTS public.access_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL, -- e.g., 'financial_module', 'telemedicine_module', 'marketplace_module'
    label TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create app_access_plans table
CREATE TABLE IF NOT EXISTS public.app_access_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('ALUNO', 'PROFISSIONAL', 'LOJISTA')),
    price_cents INTEGER NOT NULL DEFAULT 0,
    validity_days INTEGER NOT NULL DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create junction table for plans and modules
CREATE TABLE IF NOT EXISTS public.plan_modules (
    plan_id UUID REFERENCES public.app_access_plans(id) ON DELETE CASCADE,
    module_id UUID REFERENCES public.access_modules(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, module_id)
);

-- 4. Add plan_id to existing tables to track their current plan
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_plan_id') THEN
        ALTER TABLE public.profiles ADD COLUMN current_plan_id UUID REFERENCES public.app_access_plans(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'professionals' AND column_name = 'current_plan_id') THEN
        ALTER TABLE public.professionals ADD COLUMN current_plan_id UUID REFERENCES public.app_access_plans(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'marketplace_stores' AND column_name = 'current_plan_id') THEN
        ALTER TABLE public.marketplace_stores ADD COLUMN current_plan_id UUID REFERENCES public.app_access_plans(id);
    END IF;
END $$;

-- 5. Seed default modules
INSERT INTO public.access_modules (key, label, description) VALUES
('dashboard', 'Dashboard Geral', 'Acesso ao painel principal'),
('financial_module', 'Módulo Financeiro', 'Gestão de ganhos, saques e relatórios avançados'),
('telemedicine', 'Telemedicina', 'Acesso às ferramentas de consulta online'),
('marketplace', 'Gestão de Loja', 'Criação de produtos e gestão de vendas')
ON CONFLICT (key) DO NOTHING;

-- 6. Enable RLS
ALTER TABLE public.access_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_access_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

-- 7. Policies (Public read for plans and modules, admin write)
CREATE POLICY "Public read for access_modules" ON public.access_modules FOR SELECT USING (true);
CREATE POLICY "Public read for app_access_plans" ON public.app_access_plans FOR SELECT USING (true);
CREATE POLICY "Public read for plan_modules" ON public.plan_modules FOR SELECT USING (true);

-- Admin policies (requires has_role logic or admin email check)
-- Assuming a generic admin check or using the existing has_role function if available
CREATE POLICY "Admin manage access_modules" ON public.access_modules ALL USING (auth.jwt()->>'email' = 'biotreinerapp@gmail.com');
CREATE POLICY "Admin manage app_access_plans" ON public.app_access_plans ALL USING (auth.jwt()->>'email' = 'biotreinerapp@gmail.com');
CREATE POLICY "Admin manage plan_modules" ON public.plan_modules ALL USING (auth.jwt()->>'email' = 'biotreinerapp@gmail.com');
