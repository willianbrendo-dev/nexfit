import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreatePaymentIntentRequest {
    amount: number;
    paymentType: 'subscription' | 'marketplace_order' | 'store_plan' | 'professional_service' | 'lp_unlock';
    referenceId?: string;
    userId: string;
    description: string;
    paymentMethods?: string[]; // ['pix', 'credit_card']
    desiredPlan?: string; // For subscriptions
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log('[Create Payment Intent] Received request');

        // Get request body
        const body: CreatePaymentIntentRequest = await req.json();
        console.log('[Create Payment Intent] Request:', JSON.stringify(body, null, 2));

        // Validate required fields
        if (!body.amount || !body.paymentType || !body.userId || !body.description) {
            throw new Error('Missing required fields: amount, paymentType, userId, description');
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Create payment record in database first
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiration

        const { data: payment, error: dbError } = await supabase
            .from('pix_payments')
            .insert({
                user_id: body.userId,
                amount: body.amount,
                payment_type: body.paymentType,
                reference_id: body.referenceId || null,
                status: 'pending',
                expires_at: expiresAt.toISOString(),
                desired_plan: body.desiredPlan || null,
            })
            .select('id')
            .single();

        if (dbError) {
            console.error('[Create Payment Intent] Database error:', dbError);
            throw dbError;
        }

        console.log('[Create Payment Intent] Created payment record:', payment.id);

        // Get InfinitePay credentials
        const infinitePayApiKey = Deno.env.get('INFINITEPAY_API_KEY');
        const infinitePayApiUrl = Deno.env.get('INFINITEPAY_API_URL') || 'https://api.infinitepay.io/v2';
        const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;

        if (!infinitePayApiKey) {
            throw new Error('INFINITEPAY_API_KEY not configured');
        }

        // Prepare InfinitePay payment link request
        const infinitePayPayload = {
            amount: Math.round(body.amount * 100), // Convert to cents
            description: body.description,
            order_nsu: payment.id, // Our payment ID as reference
            webhook_url: webhookUrl,
            payment_methods: body.paymentMethods || ['pix', 'credit_card'],
            expires_in: 86400, // 24 hours in seconds
        };

        console.log('[Create Payment Intent] Calling InfinitePay API...');
        console.log('[Create Payment Intent] Payload:', JSON.stringify(infinitePayPayload, null, 2));

        // Call InfinitePay API to create payment link
        const infinitePayResponse = await fetch(`${infinitePayApiUrl}/payment_links`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${infinitePayApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(infinitePayPayload),
        });

        if (!infinitePayResponse.ok) {
            const errorText = await infinitePayResponse.text();
            console.error('[Create Payment Intent] InfinitePay API error:', errorText);
            throw new Error(`InfinitePay API error: ${infinitePayResponse.status} - ${errorText}`);
        }

        const infinitePayData = await infinitePayResponse.json();
        console.log('[Create Payment Intent] InfinitePay response:', JSON.stringify(infinitePayData, null, 2));

        // Update payment record with InfinitePay data
        const { error: updateError } = await supabase
            .from('pix_payments')
            .update({
                payment_url: infinitePayData.payment_url || infinitePayData.url,
                infinitepay_slug: infinitePayData.slug || infinitePayData.id,
                pix_payload: infinitePayData.pix_code || infinitePayData.qr_code_text,
                pix_qr_code: infinitePayData.qr_code_url || infinitePayData.qr_code_image,
            })
            .eq('id', payment.id);

        if (updateError) {
            console.error('[Create Payment Intent] Error updating payment with InfinitePay data:', updateError);
            throw updateError;
        }

        console.log('[Create Payment Intent] Payment intent created successfully');

        // Return response
        return new Response(
            JSON.stringify({
                success: true,
                paymentId: payment.id,
                paymentUrl: infinitePayData.payment_url || infinitePayData.url,
                qrCode: infinitePayData.qr_code_url || infinitePayData.qr_code_image,
                pixCode: infinitePayData.pix_code || infinitePayData.qr_code_text,
                expiresAt: expiresAt.toISOString(),
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        );

    } catch (error) {
        console.error('[Create Payment Intent] Error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            }
        );
    }
});
