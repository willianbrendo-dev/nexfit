import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProfileContext {
  nome: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  objetivo: string | null;
  nivel: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ===== 1) Validação manual do JWT enviado pelo frontend =====
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token de autenticação ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas");
      return new Response(JSON.stringify({ error: "Configuração de backend incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verifica o JWT do usuário logado junto ao Auth do Supabase
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SERVICE_ROLE_KEY,
      },
    });

    if (!userResponse.ok) {
      console.error("Falha ao validar JWT do usuário:", userResponse.status, await userResponse.text());
      return new Response(JSON.stringify({ error: "JWT inválido ou expirado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== 2) Lê o corpo da requisição (histórico do chat + perfil ou action) =====
    const body = await req.json();

    // Suporte ao formato do AdminContentPage: { action: "chat", message: "...", debug: true }
    // OU ao formato do NutricionistaPage: { messages: [], profile: {} }
    let messages: ChatMessage[] = [];
    let profile: ProfileContext | null = null;
    let isStreaming = true;

    if (body.action === "chat") {
      messages = [{ role: "user", content: body.message }];
      isStreaming = false; // Admin console expects a single JSON response
    } else {
      messages = body.messages || [];
      profile = body.profile || null;
    }

    // ===== 3) Acesso às variáveis de ambiente da IA =====
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // ===== 4) Monta o resumo do perfil para manter contexto (peso/objetivo) =====
    const profileSummaryLines: string[] = [];
    if (profile) {
      if (profile.nome) profileSummaryLines.push(`Nome: ${profile.nome}`);
      if (profile.peso_kg) profileSummaryLines.push(`Peso atual: ${profile.peso_kg} kg`);
      if (profile.altura_cm) profileSummaryLines.push(`Altura: ${profile.altura_cm} cm`);
      if (profile.objetivo) profileSummaryLines.push(`Objetivo principal: ${profile.objetivo}`);
      if (profile.nivel) profileSummaryLines.push(`Nível de atividade: ${profile.nivel}`);
    }

    const profileSummary =
      profileSummaryLines.length > 0
        ? `\n\nDados do aluno (do banco):\n- ${profileSummaryLines.join("\n- ")}`
        : "";

    let configSystemContext: string | null = null;
    let configInstructionsLayer: string | null = null;

    try {
      const { data: config, error: configError } = await supabaseClient
        .from("config_ai_agents")
        .select("system_context, instructions_layer")
        .eq("agent_key", "dr_bio")
        .maybeSingle();

      if (configError) {
        console.error("Erro ao carregar config_ai_agents para Dr. Bio:", configError.message);
      } else if (config) {
        configSystemContext = (config as any).system_context ?? null;
        configInstructionsLayer = (config as any).instructions_layer ?? null;
      }
    } catch (configUnexpectedError) {
      console.error("Erro inesperado ao ler config_ai_agents:", configUnexpectedError);
    }

    const baseSystemPrompt =
      "Você é o Dr. Bio, nutricionista virtual da Nexfit." +
      " Fale sempre em português do Brasil, em tom motivador, técnico porém acessível," +
      " focado em progresso gradual e hábitos sustentáveis." +
      " Nunca dê diagnósticos médicos ou prescreva medicamentos." +
      " Foque em: dicas de alimentação básica, receitas simples e rápidas, organização de refeições" +
      " e orientações de hidratação ao longo do dia." +
      " Quando sugerir receitas, priorize ingredientes comuns e acessíveis no Brasil." +
      " Nunca invente dados do aluno: use apenas o que foi passado no contexto." +
      " Se o aluno pedir algo fora de nutrição, responda brevemente e traga o foco de volta para alimentação e hábitos." +
      "\n\n**IMPORTANTE - Estilo de resposta:**" +
      " Seja direto e papo reto, evitando rodeios." +
      " Cada resposta deve ter no MÁXIMO ~400 caracteres (cerca de 3 a 4 frases curtas)." +
      " Nunca escreva parágrafos com mais de 3 linhas." +
      " Quando listar ingredientes ou macros de qualquer API, use sempre listas com marcadores e emojis (formato escaneável)." +
      " Responda como em um chat de WhatsApp: blocos curtos, com quebras de linha entre ideias diferentes." +
      " Evite textos longos e corridos. Priorize clareza e leitura fácil no celular." +
      " Use formatação em Markdown com **negrito** para termos importantes e emojis motivadores quando fizer sentido." +
      " Termine SEMPRE a mensagem com uma pergunta curta ou incentivo para engajar (ex.: 'Partiu treino?' ou 'Dúvida sobre mais algum alimento?').";

    const systemPrompt =
      (configSystemContext ? `${configSystemContext.trim()}\n\n` : "") +
      baseSystemPrompt +
      (configInstructionsLayer
        ? `\n\nInstruções adicionais de integração de API a serem seguidas sempre que houver dados externos disponíveis:\n${configInstructionsLayer}`
        : "") +
      profileSummary;

    // ===== 5) Chamada ao Lovable AI Gateway =====
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash", // Updated to a more standard model if 2.5 flash was experimental
        stream: isStreaming,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso do Dr. Bio excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await aiResponse.text();
      console.error("Dr. Bio AI error:", aiResponse.status, text);
      return new Response(JSON.stringify({ error: "Erro ao conversar com o Dr. Bio." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isStreaming) {
      return new Response(aiResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      const data = await aiResponse.json();
      const reply = data.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({
        reply,
        debug_info: body.debug ? data : undefined
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("dr-bio-agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
