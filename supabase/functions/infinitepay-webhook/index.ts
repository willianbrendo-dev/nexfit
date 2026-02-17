import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
    event: string;
    order_nsu: string;
    transaction_nsu: string;
    receipt_url?: string;
    slug?: string;
    capture_method?: string;
    amount?: number;
    status?: string;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log('[InfinitePay Webhook] Received request');

        // Get webhook secret for validation
        const webhookSecret = Deno.env.get('INFINITEPAY_WEBHOOK_SECRET');

        // Validate signature (if InfinitePay provides one in headers)
        const signature = req.headers.get('x-infinitepay-signature');
        if (webhookSecret && signature) {
            // TODO: Implement signature validation when InfinitePay provides documentation
            console.log('[InfinitePay Webhook] Signature validation skipped (not implemented)');
        }

        const payload: WebhookPayload = await req.json();
        console.log('[InfinitePay Webhook] Payload:', JSON.stringify(payload, null, 2));

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Process based on event type
        switch (payload.event) {
            case 'payment.succeeded':
                await handlePaymentSucceeded(supabase, payload);
                break;

            case 'payment.failed':
                await handlePaymentFailed(supabase, payload);
                break;

            case 'payment.refunded':
                await handlePaymentRefunded(supabase, payload);
                break;

            default:
                console.log(`[InfinitePay Webhook] Unknown event type: ${payload.event}`);
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Webhook processed' }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        );

    } catch (error) {
        console.error('[InfinitePay Webhook] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            }
        );
    }
});

async function handlePaymentSucceeded(supabase: any, payload: WebhookPayload) {
    console.log('[InfinitePay Webhook] Processing payment.succeeded');

    // Find payment by order_nsu (our payment ID)
    const { data: payment, error: fetchError } = await supabase
        .from('pix_payments')
        .select('*')
        .eq('id', payload.order_nsu)
        .maybeSingle();

    if (fetchError || !payment) {
        console.error('[InfinitePay Webhook] Payment not found:', payload.order_nsu);
        throw new Error(`Payment not found: ${payload.order_nsu}`);
    }

    console.log('[InfinitePay Webhook] Found payment:', payment.id);

    // Update payment status
    const { error: updateError } = await supabase
        .from('pix_payments')
        .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            infinitepay_transaction_id: payload.transaction_nsu,
            infinitepay_slug: payload.slug,
            receipt_url: payload.receipt_url,
            payment_method: payload.capture_method,
        })
        .eq('id', payment.id);

    if (updateError) {
        console.error('[InfinitePay Webhook] Error updating payment:', updateError);
        throw updateError;
    }

    console.log('[InfinitePay Webhook] Payment updated to paid');

    // Handle post-payment actions based on payment type
    await handlePostPaymentActions(supabase, payment);

    console.log('[InfinitePay Webhook] Payment succeeded processing complete');
}

async function handlePaymentFailed(supabase: any, payload: WebhookPayload) {
    console.log('[InfinitePay Webhook] Processing payment.failed');

    const { error } = await supabase
        .from('pix_payments')
        .update({
            status: 'failed',
            infinitepay_transaction_id: payload.transaction_nsu,
        })
        .eq('id', payload.order_nsu);

    if (error) {
        console.error('[InfinitePay Webhook] Error updating failed payment:', error);
        throw error;
    }

    console.log('[InfinitePay Webhook] Payment marked as failed');
}

async function handlePaymentRefunded(supabase: any, payload: WebhookPayload) {
    console.log('[InfinitePay Webhook] Processing payment.refunded');

    const { error } = await supabase
        .from('pix_payments')
        .update({
            status: 'refunded',
            infinitepay_transaction_id: payload.transaction_nsu,
        })
        .eq('id', payload.order_nsu);

    if (error) {
        console.error('[InfinitePay Webhook] Error updating refunded payment:', error);
        throw error;
    }

    console.log('[InfinitePay Webhook] Payment marked as refunded');
}

async function handlePostPaymentActions(supabase: any, payment: any) {
    console.log('[InfinitePay Webhook] Handling post-payment actions for type:', payment.payment_type);

    switch (payment.payment_type) {
        case 'subscription':
            // Update user subscription plan
            if (payment.user_id) {
                const plan = payment.desired_plan || 'ADVANCE';
                const now = new Date();
                const expiresAt = new Date(now);
                expiresAt.setDate(now.getDate() + 30); // 30 days

                await supabase
                    .from('profiles')
                    .update({
                        subscription_plan: plan,
                        plan_expires_at: expiresAt.toISOString(),
                    })
                    .eq('id', payment.user_id);

                console.log(`[InfinitePay Webhook] Updated user ${payment.user_id} to plan ${plan}`);
            }
            break;

        case 'marketplace_order':
            // Update marketplace order status
            if (payment.reference_id) {
                await supabase
                    .from('marketplace_orders')
                    .update({ status: 'paid' })
                    .eq('id', payment.reference_id);

                console.log(`[InfinitePay Webhook] Updated marketplace order ${payment.reference_id} to paid`);
            }
            break;

        case 'store_plan':
            // Update store subscription
            if (payment.reference_id) {
                const now = new Date();
                const expiresAt = new Date(now);
                expiresAt.setDate(now.getDate() + 30); // 30 days

                await supabase
                    .from('marketplace_stores')
                    .update({
                        subscription_plan: 'PRO',
                        plan_expires_at: expiresAt.toISOString(),
                    })
                    .eq('id', payment.reference_id);

                console.log(`[InfinitePay Webhook] Updated store ${payment.reference_id} to PRO plan`);
            }
            break;

        case 'lp_unlock':
            // Unlock professional LP
            if (payment.reference_id) {
                await supabase
                    .from('professionals')
                    .update({
                        lp_unlocked: true,
                        lp_payment_id: payment.id,
                        lp_unlocked_at: new Date().toISOString(),
                    })
                    .eq('id', payment.reference_id);

                console.log(`[InfinitePay Webhook] Unlocked LP for professional ${payment.reference_id}`);
            }
            break;

        case 'professional_service':
            // Update hire status and professional balance
            if (payment.reference_id) {
                const { data: hire } = await supabase
                    .from('professional_hires')
                    .select('professional_id, paid_amount')
                    .eq('id', payment.reference_id)
                    .single();

                if (hire) {
                    const amount = Number(hire.paid_amount || 0);
                    const platformFee = amount * 0.15;
                    const professionalNet = amount - platformFee;

                    // Update hire record
                    await supabase
                        .from('professional_hires')
                        .update({
                            is_paid: true,
                            payment_status: 'paid',
                            platform_fee: platformFee,
                        })
                        .eq('id', payment.reference_id);

                    // Update professional balance
                    const { data: prof } = await supabase
                        .from('professionals')
                        .select('balance')
                        .eq('id', hire.professional_id)
                        .single();

                    await supabase
                        .from('professionals')
                        .update({
                            balance: (Number(prof?.balance || 0)) + professionalNet,
                        })
                        .eq('id', hire.professional_id);

                    // Create chat room if not exists
                    const { data: existingRoom } = await supabase
                        .from('professional_chat_rooms')
                        .select('id')
                        .eq('professional_id', hire.professional_id)
                        .eq('student_id', payment.user_id)
                        .maybeSingle();

                    if (!existingRoom) {
                        await supabase
                            .from('professional_chat_rooms')
                            .insert({
                                professional_id: hire.professional_id,
                                student_id: payment.user_id,
                                last_message_at: new Date().toISOString(),
                            });
                    }

                    console.log(`[InfinitePay Webhook] Updated professional service ${payment.reference_id}`);
                }
            }
            break;

        default:
            console.log(`[InfinitePay Webhook] No post-payment action for type: ${payment.payment_type}`);
    }
}
