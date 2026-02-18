import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...(init?.headers ?? {}) },
  });
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildEmailHtml(name: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Código de Verificação - NexFit</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;border:1px solid #222;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:28px;font-weight:900;">NexFit</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:2px;text-transform:uppercase;">Sistema Elite de Performance</p>
        </td></tr>
        <tr><td style="padding:40px 32px;">
          <p style="margin:0 0 8px;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Olá, ${name}</p>
          <h2 style="margin:0 0 24px;color:#fff;font-size:22px;font-weight:700;">Confirme seu e-mail</h2>
          <p style="margin:0 0 32px;color:#aaa;font-size:15px;line-height:1.6;">Use o código abaixo para verificar seu endereço de e-mail e ativar sua conta NexFit.</p>
          <div style="background:#0a0a0a;border:2px solid #22c55e;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0 0 8px;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Seu código de verificação</p>
            <p style="margin:0;color:#22c55e;font-size:42px;font-weight:900;letter-spacing:12px;font-family:monospace;">${otpCode}</p>
            <p style="margin:12px 0 0;color:#555;font-size:12px;">Válido por <strong style="color:#888;">15 minutos</strong></p>
          </div>
          <div style="background:#1a1a1a;border-left:3px solid #f59e0b;border-radius:4px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;color:#888;font-size:13px;">⚠️ Se você não criou uma conta no NexFit, ignore este e-mail.</p>
          </div>
          <p style="margin:0;color:#555;font-size:12px;line-height:1.6;">Este código expira em 15 minutos. Caso precise de um novo código, acesse o aplicativo e clique em "Reenviar código".</p>
        </td></tr>
        <tr><td style="background:#0d0d0d;padding:20px 32px;border-top:1px solid #1a1a1a;text-align:center;">
          <p style="margin:0;color:#444;font-size:11px;">NexFit System · Elite Performance · © 2025</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL"); // e.g. "NexFit <noreply@seudominio.com>"
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Configuração de backend incompleta" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim() || "Usuário";

    if (!email || !email.includes("@")) {
      return json({ error: "E-mail inválido" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Invalidate any previous unused OTPs for this email
    await supabase
      .from("email_verification_otps")
      .update({ used_at: new Date().toISOString() })
      .eq("email", email)
      .is("used_at", null);

    // Generate and store new OTP
    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("email_verification_otps").insert({
      email,
      otp_code: otpCode,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("send-email-otp: insert error", insertError);
      return json({ error: "Erro ao gerar código" }, { status: 500 });
    }

    const emailHtml = buildEmailHtml(name, otpCode);
    const subject = `${otpCode} — Seu código de verificação NexFit`;

    // --- Try Resend (requires RESEND_FROM_EMAIL with verified domain) ---
    if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [email],
          subject,
          html: emailHtml,
        }),
      });

      if (resendRes.ok) {
        return json({ ok: true, provider: "resend" });
      }
      const resendError = await resendRes.text();
      console.error("send-email-otp: Resend error", resendRes.status, resendError);
      // Fall through to Brevo
    }

    // --- Try Brevo (SendinBlue) — free plan, no domain verification needed ---
    if (BREVO_API_KEY) {
      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "NexFit", email: "noreply@nexfitsystem.com" },
          to: [{ email }],
          subject,
          htmlContent: emailHtml,
        }),
      });

      if (brevoRes.ok) {
        return json({ ok: true, provider: "brevo" });
      }
      const brevoError = await brevoRes.text();
      console.error("send-email-otp: Brevo error", brevoRes.status, brevoError);
      return json({ error: `Falha ao enviar e-mail: ${brevoError}` }, { status: 500 });
    }

    // --- Dev mode: no email provider configured ---
    console.log(`[DEV] OTP for ${email}: ${otpCode}`);
    return json({ ok: true, dev_otp: otpCode });

  } catch (err) {
    console.error("send-email-otp: unexpected error", err);
    return json({ error: "Erro inesperado" }, { status: 500 });
  }
});
