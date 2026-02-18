-- Repair professional_hires table
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

-- Enable RLS if not enabled
ALTER TABLE public.professional_hires ENABLE ROW LEVEL SECURITY;

-- Add policies if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_hires' AND policyname = 'Students can insert hires') THEN
        CREATE POLICY "Students can insert hires" ON public.professional_hires FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_hires' AND policyname = 'Participants can view hires') THEN
        CREATE POLICY "Participants can view hires" ON public.professional_hires FOR SELECT TO authenticated USING (auth.uid() = student_id OR auth.uid() IN (SELECT user_id FROM professionals WHERE id = professional_id));
    END IF;
END $$;
