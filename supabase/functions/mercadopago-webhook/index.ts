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

        const url = new URL(req.url)
        const topic = url.searchParams.get('topic') || url.searchParams.get('type')
        const id = url.searchParams.get('id') || url.searchParams.get('data.id')

        console.log(`[MP Webhook] Received notification - Topic: ${topic}, ID: ${id}`)

        // Mercado Pago webhooks often send just the ID. We need to fetch the full payment details.
        if (topic === 'payment') {
            const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
                }
            })

            if (!response.ok) {
                throw new Error(`Failed to fetch payment details from MP: ${response.statusText}`)
            }

            const payment = await response.json()
            const externalReference = payment.external_reference // This is our local payment ID
            const status = payment.status

            console.log(`[MP Webhook] Payment ${id} status: ${status}, Ref: ${externalReference}`)

            if (externalReference) {
                // Update local payment record
                const { data: localPayment, error: fetchError } = await supabaseClient
                    .from('pix_payments')
                    .select('*')
                    .eq('id', externalReference)
                    .single()

                if (fetchError) throw fetchError

                const isPaid = status === 'approved'

                await supabaseClient
                    .from('pix_payments')
                    .update({
                        mercadopago_status: status,
                        status: isPaid ? 'paid' : (status === 'rejected' || status === 'cancelled' ? 'failed' : 'pending'),
                        paid_at: isPaid ? new Date().toISOString() : null
                    })
                    .eq('id', externalReference)

                // If newly approved, handle post-payment logic
                if (isPaid && localPayment.status !== 'paid') {
                    await handlePostPaymentActions(supabaseClient, localPayment)
                }
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("[MP Webhook] Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function handlePostPaymentActions(supabase: any, payment: any) {
    console.log(`[MP Webhook] Handling post-payment for type: ${payment.payment_type}`)

    switch (payment.payment_type) {
        case 'marketplace_order':
            if (payment.reference_id) {
                await supabase
                    .from('marketplace_orders')
                    .update({ status: 'paid' })
                    .eq('id', payment.reference_id)
            }
            break;

        case 'subscription':
            if (payment.user_id) {
                // Find existing plan or set default
                const expiresAt = new Date()
                expiresAt.setMonth(expiresAt.getMonth() + 1)

                await supabase
                    .from('profiles')
                    .update({
                        subscription_plan: payment.desired_plan || 'ADVANCE',
                        plan_expires_at: expiresAt.toISOString()
                    })
                    .eq('id', payment.user_id)
            }
            break;

        // Add other cases as needed (store_plan, lp_unlock, professional_service)
    }
}
