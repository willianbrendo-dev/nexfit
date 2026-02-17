-- Add InfinitePay integration fields to pix_payments table
ALTER TABLE pix_payments 
ADD COLUMN IF NOT EXISTS infinitepay_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS infinitepay_slug TEXT,
ADD COLUMN IF NOT EXISTS payment_url TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS desired_plan TEXT;

-- Add index for faster lookups by InfinitePay transaction ID
CREATE INDEX IF NOT EXISTS idx_pix_payments_infinitepay_transaction_id 
ON pix_payments(infinitepay_transaction_id);

-- Add index for faster lookups by slug
CREATE INDEX IF NOT EXISTS idx_pix_payments_infinitepay_slug 
ON pix_payments(infinitepay_slug);

-- Add comment to document the new fields
COMMENT ON COLUMN pix_payments.infinitepay_transaction_id IS 'Transaction NSU from InfinitePay';
COMMENT ON COLUMN pix_payments.infinitepay_slug IS 'Payment slug/ID from InfinitePay';
COMMENT ON COLUMN pix_payments.payment_url IS 'Payment link URL from InfinitePay';
COMMENT ON COLUMN pix_payments.payment_method IS 'Payment method used: pix or credit_card';
COMMENT ON COLUMN pix_payments.receipt_url IS 'Receipt URL from InfinitePay';
COMMENT ON COLUMN pix_payments.desired_plan IS 'Desired subscription plan (for subscription payments)';
