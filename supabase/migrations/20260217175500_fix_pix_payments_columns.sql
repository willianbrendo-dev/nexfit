-- Migration to add remaining Mercado Pago fields to pix_payments table
ALTER TABLE pix_payments 
ADD COLUMN IF NOT EXISTS pix_payload TEXT,
ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;

COMMENT ON COLUMN pix_payments.pix_payload IS 'PIX copy and paste code (payload)';
COMMENT ON COLUMN pix_payments.pix_qr_code IS 'PIX QR Code in Base64 format';
