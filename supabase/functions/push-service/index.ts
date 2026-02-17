import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from "https://esm.sh/web-push@3.6.6"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userId, title, body, url: targetUrl, segment } = await req.json()

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const vapidKeys = {
            publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
            privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
        }

        webpush.setVapidDetails(
            'mailto:admin@biotreiner.pro',
            vapidKeys.publicKey,
            vapidKeys.privateKey
        )

        // 1. Get subscriptions
        let subscriptions = []

        if (userId) {
            // Target specific user
            const { data } = await supabase
                .from('push_subscriptions')
                .select('subscription')
                .eq('user_id', userId)
            subscriptions = data || []
        } else if (segment) {
            // Target segments (integration for later)
            // For now, let's say 'ALL' just fetches everyone
            const { data } = await supabase
                .from('push_subscriptions')
                .select('subscription')
            subscriptions = data || []
        }

        if (subscriptions.length === 0) {
            return new Response(JSON.stringify({ success: true, sent: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. Send pushes
        const payload = JSON.stringify({
            title,
            body,
            url: targetUrl || '/'
        })

        const results = await Promise.allSettled(
            subscriptions.map(s =>
                webpush.sendNotification(s.subscription, payload)
            )
        )

        // 3. Cleanup failed subscriptions (404/410)
        const failedIndices = results
            .map((res, i) => (res.status === 'rejected' && (res.reason.statusCode === 404 || res.reason.statusCode === 410)) ? i : -1)
            .filter(i => i !== -1)

        if (failedIndices.length > 0) {
            const failedEndpoints = failedIndices.map(i => subscriptions[i].subscription.endpoint)
            await supabase
                .from('push_subscriptions')
                .delete()
                .in('subscription->>endpoint', failedEndpoints)
        }

        return new Response(JSON.stringify({
            success: true,
            sent: results.filter(r => r.status === 'fulfilled').length,
            failed: failedIndices.length
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error("[Push Service] Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
