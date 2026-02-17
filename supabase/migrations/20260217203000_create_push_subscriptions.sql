-- Create push_subscriptions table to store browser push tokens
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    device_info JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add tracking columns for notifications
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expiry_notified_at DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekly_insight_notified_at DATE;

-- Index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

-- Set up RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push subscriptions"
    ON public.push_subscriptions
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_push_subscriptions_updated
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_push_subscriptions_updated_at();

-- Add comments for postgrest
COMMENT ON TABLE public.push_subscriptions IS 'Stores browser push notification subscriptions for PWA users.';
