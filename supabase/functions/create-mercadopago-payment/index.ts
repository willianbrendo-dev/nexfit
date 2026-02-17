import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { transaction_amount, description, payment_method_id, payer, metadata } = await req.json()
        const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')

        if (!MP_ACCESS_TOKEN) {
            throw new Error("MERCADOPAGO_ACCESS_TOKEN is not set")
        }

        // Prepare payment request
        const paymentData: any = {
            transaction_amount,
            description,
            payment_method_id: payment_method_id === 'pix' ? 'pix' : undefined, // MP determines card brand automatically if using brick
            payer: {
                email: payer.email,
                first_name: payer.first_name,
                last_name: payer.last_name,
            },
            notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,
            metadata: {
                ...metadata,
                // We add our internal payment ID after creation
            }
        }

        // Step 1: Create local payment record in pix_payments
        // Ensure empty strings are converted to null for UUID columns
        const userId = metadata.user_id || null;
        const referenceId = metadata.reference_id || null;
        console.log(`[MP Function] Creating payment for User: ${userId}, Ref: ${referenceId}`);

        const { data: localPayment, error: localError } = await supabaseClient
            .from('pix_payments')
            .insert({
                user_id: userId,
                amount: transaction_amount,
                payment_type: metadata.payment_type,
                reference_id: referenceId,
                desired_plan: metadata.desired_plan,
                status: 'pending',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
            })
            .select()
            .single()

        if (localError) throw localError

        // Step 2: Create payment in Mercado Pago
        // If 'card', create a Preference (Checkout Pro). If 'pix', create Payment.

        let mpResponse;
        let mpData;

        if (payment_method_id === 'card') {
            // Create Preference for Card
            console.log("[MP] Creating Preference for Card (Checkout Pro)");
            mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    items: [
                        {
                            title: description,
                            quantity: 1,
                            currency_id: 'BRL',
                            unit_price: transaction_amount,
                        }
                    ],
                    payer: {
                        email: payer.email,
                        name: payer.first_name,
                        surname: payer.last_name,
                    },
                    back_urls: {
                        success: "https://afffyfsmcvphrhbtxrgt.supabase.co", // Replace with actual app URL if needed
                        failure: "https://afffyfsmcvphrhbtxrgt.supabase.co",
                        pending: "https://afffyfsmcvphrhbtxrgt.supabase.co"
                    },
                    auto_return: "approved",
                    external_reference: localPayment.id,
                    notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,
                    metadata: metadata,
                }),
            });
        } else {
            // Create Payment for PIX
            console.log("[MP] Creating Direct Payment for PIX");
            mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': localPayment.id,
                },
                body: JSON.stringify({
                    ...paymentData,
                    external_reference: localPayment.id,
                }),
            });
        }

        mpData = await mpResponse.json();

        if (!mpResponse.ok) {
            console.error("[MP] API Error:", mpData);
            throw new Error(mpData.message || "Error creating payment/preference in Mercado Pago");
        }

        // Step 3: Update local record with MP info
        let updateData: any = {};
        let responseData: any = {
            success: true,
            payment_id: localPayment.id,
        };

        if (payment_method_id === 'card') {
            // Preference created
            updateData = {
                mercadopago_id: mpData.id, // Preference ID
                mercadopago_status: 'pending', // Status starts as pending until webhook
                mercadopago_payment_method: 'card_preference',
                payment_url: mpData.init_point, // Checkout URL
            };
            responseData.payment_url = mpData.init_point; // URL for frontend to redirect
            // Preferences don't have immediate status or QR code
            responseData.status = 'pending';
        } else {
            // Payment created (PIX)
            updateData = {
                mercadopago_id: mpData.id.toString(),
                mercadopago_status: mpData.status,
                mercadopago_payment_method: mpData.payment_method_id,
            };
            responseData.status = mpData.status;

            if (mpData.point_of_interaction?.transaction_data) {
                const txData = mpData.point_of_interaction.transaction_data;
                updateData.pix_payload = txData.qr_code;
                updateData.pix_qr_code = txData.qr_code_base64;
                updateData.payment_url = txData.ticket_url;

                responseData.qr_code = txData.qr_code;
                responseData.qr_code_base64 = txData.qr_code_base64;
                responseData.ticket_url = txData.ticket_url;
            }
        }

        await supabaseClient
            .from('pix_payments')
            .update(updateData)
            .eq('id', localPayment.id);

        return new Response(
            JSON.stringify(responseData),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error("[MP] Error:", error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
