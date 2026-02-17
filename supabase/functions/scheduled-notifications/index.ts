import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date();
    // Brazil Time (UTC-3)
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const todayStr = now.toISOString().split('T')[0];

    console.log(`[Scheduled Notifications] Running at ${now.toISOString()}. Brazil Hour: ${brHour}`);

    try {
        // 1. DAILY MOTIVATION (5h and 17h)
        if (brHour === 5 || brHour === 17) {
            const motivations = brHour === 5
                ? [
                    "Bom dia! O suor de hoje é o sucesso de amanhã. Vamos treinar?",
                    "5 da manhã: enquanto eles dormem, você vence. Hora de brilhar!",
                    "Acorde com propósito. O seu melhor treino te espera agora."
                ]
                : [
                    "Dia produtivo? Termine com chave de ouro no treino das 17h!",
                    "Hora de descarregar o estresse do dia. Partiu Nexfit?",
                    "Não deixe para amanhã o treino que você pode fazer hoje."
                ];

            const message = motivations[Math.floor(Math.random() * motivations.length)];

            // Get all active push users (simplification: everyone subscribed)
            const { data: subs } = await supabase.from('push_subscriptions').select('user_id');
            const uniqueUsers = [...new Set((subs || []).map(s => s.user_id))];

            for (const uid of uniqueUsers) {
                await callPushService(uid, "Motivação Nexfit 🚀", message, "/aluno/monitoramento");
            }
        }

        // 2. PLAN EXPIRY WARNING (5 days before)
        // Find users whose plan expires in exactly 5 days OR between 5 and 0 days if not notified today.
        const fiveDaysFromNow = new Date();
        fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
        const fiveDaysIso = fiveDaysFromNow.toISOString();

        const { data: expiringSoon } = await supabase
            .from('profiles')
            .select('id, nome, plan_expires_at, plan_expiry_notified_at')
            .not('plan_expires_at', 'is', null)
            .lt('plan_expires_at', fiveDaysIso)
            .gt('plan_expires_at', todayStr); // Not yet expired

        for (const profile of (expiringSoon || [])) {
            const notifiedAt = profile.plan_expiry_notified_at;
            if (notifiedAt !== todayStr) {
                const expiresDate = new Date(profile.plan_expires_at);
                const diffDays = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

                if (diffDays <= 5 && diffDays > 0) {
                    await callPushService(
                        profile.id,
                        "Assinatura expirando! ⏳",
                        `Olá ${profile.nome || 'aluno'}, seu plano vence em ${diffDays} dias. Renove agora para não perder o progresso!`,
                        "/aluno/perfil/plano"
                    );

                    // Mark as notified today
                    await supabase.from('profiles').update({ plan_expiry_notified_at: todayStr }).eq('id', profile.id);
                }
            }
        }

        // 3. WEEKLY EVOLUTION (Every 7 days)
        if (brHour === 9) { // At 9 AM
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const sevenDaysIso = sevenDaysAgo.toISOString().split('T')[0];

            const { data: needWeekly } = await supabase
                .from('profiles')
                .select('id, nome, weekly_insight_notified_at')
                .or(`weekly_insight_notified_at.is.null,weekly_insight_notified_at.lte.${sevenDaysIso}`);

            for (const profile of (needWeekly || [])) {
                // Fetch count of sessions in last 7 days
                const { count } = await supabase
                    .from('user_activities')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', profile.id)
                    .gt('created_at', sevenDaysIso);

                const activitiesCount = count || 0;
                let message = `Você completou ${activitiesCount} treinos nos últimos 7 dias. `;

                if (activitiesCount > 3) {
                    message += "Ritmo excelente! Continue assim. 🔥";
                } else if (activitiesCount > 0) {
                    message += "Bom trabalho! Que tal aumentar um pouco a meta semana que vem? 💪";
                } else {
                    message += "Sentimos sua falta! Vamos recomeçar hoje? 🏃‍♂️";
                }

                await callPushService(profile.id, "Sua Evolução Semanal 📈", message, "/aluno/perfil/estatisticas");
                await supabase.from('profiles').update({ weekly_insight_notified_at: todayStr }).eq('id', profile.id);
            }
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (err) {
        console.error("[Scheduled Notifications] Global Error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});

async function callPushService(userId: string, title: string, body: string, url: string) {
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/push-service`;

    try {
        await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_KEY}`
            },
            body: JSON.stringify({ userId, title, body, url })
        });
    } catch (e) {
        console.error(`Failed to trigger push for ${userId}`, e);
    }
}
