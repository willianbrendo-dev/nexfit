import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "update" | "ban" | "delete" | "create_store_owner";

type UpdatePayload = {
  action: "update";
  userId: string;
  data: {
    display_name?: string | null;
    nome?: string | null;
    ativo?: boolean;
  };
};

type BanPayload = { action: "ban"; userId: string };
type DeletePayload = { action: "delete"; userId: string };

type CreateStoreOwnerPayload = {
  action: "create_store_owner";
  email: string;
  password: string;
  storeName: string;
  storeType: string;
  storeDescription?: string;
  profileImageUrl?: string;
  bannerImageUrl?: string;
  cnpj?: string;
  whatsapp?: string;
};

type Payload = UpdatePayload | BanPayload | DeletePayload | CreateStoreOwnerPayload;

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...(init?.headers ?? {}) },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error("admin-user-management: env vars ausentes");
    return json({ error: "Configuração de backend incompleta" }, { status: 500 });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) return json({ error: "Token de autenticação ausente" }, { status: 401 });

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "JWT inválido ou expirado" }, { status: 401 });
    }

    const caller = userData.user;
    const MASTER_EMAIL = "biotreinerapp@gmail.com";

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (roleError) {
      return json({ error: "Falha ao verificar permissões" }, { status: 500 });
    }

    const authorized = Boolean(isAdmin) || (caller.email ?? "").toLowerCase() === MASTER_EMAIL;
    if (!authorized) {
      return json({ error: "Acesso negado" }, { status: 403 });
    }

    const payload = (await req.json()) as Partial<Payload>;
    const action = payload.action as Action | undefined;

    if (!action) return json({ error: "Payload inválido" }, { status: 400 });

    // ─── CREATE STORE OWNER ───
    if (action === "create_store_owner") {
      const p = payload as Partial<CreateStoreOwnerPayload>;
      const email = p.email?.trim().toLowerCase();
      const password = p.password?.trim();
      const storeName = p.storeName?.trim();
      const storeType = p.storeType?.trim();

      if (!email || !password || !storeName || !storeType) {
        return json({ error: "Preencha todos os campos obrigatórios (email, senha, nome da loja, tipo)." }, { status: 400 });
      }

      if (password.length < 6) {
        return json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
      }

      // Check if email already exists (must NOT match any existing user)
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const emailExists = existingUsers?.users?.some(
        (u: any) => (u.email ?? "").toLowerCase() === email
      );

      if (emailExists) {
        return json({
          error: "Este e-mail já está cadastrado no sistema. O lojista deve usar um e-mail diferente dos alunos."
        }, { status: 409 });
      }

      // 1. Create auth user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError || !newUser?.user) {
        return json({ error: createError?.message ?? "Erro ao criar conta do lojista." }, { status: 400 });
      }

      const userId = newUser.user.id;

      // 2. Create profile
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        display_name: storeName,
        onboarding_completed: true,
        ativo: true,
      }, { onConflict: "id" });

      if (profileError) {
        console.error("create_store_owner: profile error", profileError);
      }

      // 3. Assign store_owner role
      const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "store_owner",
      });

      if (roleInsertError) {
        console.error("create_store_owner: role error", roleInsertError);
      }

      // 4. Create store in stores table
      const { data: store, error: storeError } = await supabaseAdmin
        .from("stores")
        .insert({
          name: storeName,
          store_type: storeType,
          description: p.storeDescription || null,
        })
        .select()
        .maybeSingle();

      if (storeError || !store) {
        return json({ error: storeError?.message ?? "Erro ao criar loja." }, { status: 400 });
      }

      // 5. Link user to store
      await supabaseAdmin.from("store_users").insert({
        store_id: store.id,
        user_id: userId,
        role: "store_owner",
      });

      // 6. Also create in marketplace_stores for public marketplace
      const { error: mkError } = await supabaseAdmin
        .from("marketplace_stores")
        .insert({
          nome: storeName,
          owner_user_id: userId,
          store_type: storeType,
          descricao: p.storeDescription || null,
          status: "aprovado",
          profile_image_url: p.profileImageUrl || null,
          banner_image_url: p.bannerImageUrl || null,
        });

      if (mkError) {
        console.error("create_store_owner: marketplace_stores error", mkError);
        return json({
          error: `Erro ao vincular no marketplace: ${mkError.message}. Verifique as permissões e restrições da tabela marketplace_stores.`,
          details: mkError
        }, { status: 400 });
      }

      // 7. Link profile to store
      await supabaseAdmin.from("profiles").update({ store_id: store.id }).eq("id", userId);

      return json({ ok: true, userId, storeId: store.id });
    }

    // ─── EXISTING ACTIONS ───
    const userId = (payload as any).userId;
    if (!userId) return json({ error: "Payload inválido" }, { status: 400 });

    if (action === "update") {
      const data = (payload as UpdatePayload).data;
      if (!data) return json({ error: "Payload inválido" }, { status: 400 });

      const update: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(data, "display_name")) update.display_name = data.display_name ?? null;
      if (Object.prototype.hasOwnProperty.call(data, "nome")) update.nome = data.nome ?? null;
      if (Object.prototype.hasOwnProperty.call(data, "ativo")) update.ativo = Boolean(data.ativo);

      const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
      if (error) return json({ error: error.message }, { status: 400 });
      return json({ ok: true });
    }

    if (action === "ban") {
      const { error } = await supabaseAdmin.from("profiles").update({ ativo: false }).eq("id", userId);
      if (error) return json({ error: error.message }, { status: 400 });
      return json({ ok: true });
    }

    if (action === "delete") {
      console.log("admin-user-management: delete start", { userId });

      // --- 1. Find store-related IDs for this user ---
      const { data: userStores } = await supabaseAdmin
        .from("store_users")
        .select("store_id")
        .eq("user_id", userId);
      const storeIds = (userStores ?? []).map((s: any) => s.store_id);

      const { data: mkStores } = await supabaseAdmin
        .from("marketplace_stores")
        .select("id")
        .eq("owner_user_id", userId);
      const mkStoreIds = (mkStores ?? []).map((s: any) => s.id);

      // Get marketplace order IDs (as buyer) to delete order items
      const { data: mkOrders } = await supabaseAdmin
        .from("marketplace_orders")
        .select("id")
        .eq("user_id", userId);
      const mkOrderIds = (mkOrders ?? []).map((o: any) => o.id);

      // Get store order IDs to delete cart items
      const { data: stOrders } = await supabaseAdmin
        .from("store_orders")
        .select("id")
        .eq("user_id", userId);
      const stOrderIds = (stOrders ?? []).map((o: any) => o.id);

      // --- 2. Delete dependent rows in correct order ---
      const preSteps: Array<{ label: string; promise: Promise<{ error: any }> }> = [];

      // Delete marketplace_order_items for buyer orders
      if (mkOrderIds.length) {
        preSteps.push({ label: "marketplace_order_items(buyer)", promise: supabaseAdmin.from("marketplace_order_items").delete().in("order_id", mkOrderIds) as any });
      }

      // Delete marketplace_order_items & orders for store products
      if (mkStoreIds.length) {
        // Get orders placed TO this store
        const { data: storeOrders } = await supabaseAdmin
          .from("marketplace_orders")
          .select("id")
          .in("store_id", mkStoreIds);
        const storeOrderIds = (storeOrders ?? []).map((o: any) => o.id);
        if (storeOrderIds.length) {
          preSteps.push({ label: "marketplace_order_items(store)", promise: supabaseAdmin.from("marketplace_order_items").delete().in("order_id", storeOrderIds) as any });
          preSteps.push({ label: "marketplace_orders(store)", promise: supabaseAdmin.from("marketplace_orders").delete().in("store_id", mkStoreIds) as any });
        }
        preSteps.push({ label: "marketplace_products", promise: supabaseAdmin.from("marketplace_products").delete().in("store_id", mkStoreIds) as any });
        preSteps.push({ label: "pix_configs(mk)", promise: supabaseAdmin.from("pix_configs").delete().in("marketplace_store_id", mkStoreIds) as any });
      }

      // Delete store_cart_items before store_orders
      if (stOrderIds.length) {
        preSteps.push({ label: "store_cart_items", promise: supabaseAdmin.from("store_cart_items").delete().in("order_id", stOrderIds) as any });
      }

      // Delete pix_configs for stores
      if (storeIds.length) {
        preSteps.push({ label: "pix_configs(store)", promise: supabaseAdmin.from("pix_configs").delete().in("store_id", storeIds) as any });
        // Delete store_products before stores
        preSteps.push({ label: "store_products", promise: supabaseAdmin.from("store_products").delete().in("store_id", storeIds) as any });
      }

      if (preSteps.length) {
        await Promise.allSettled(preSteps.map((s) => s.promise));
      }

      // --- 3. Main cleanup (original + new tables) ---
      const deleteSteps: Array<{ label: string; promise: Promise<{ error: any }> }> = [
        { label: "user_roles", promise: supabaseAdmin.from("user_roles").delete().eq("user_id", userId) as any },
        { label: "agenda_treinos", promise: supabaseAdmin.from("agenda_treinos").delete().eq("aluno_id", userId) as any },
        { label: "atividade_sessao", promise: supabaseAdmin.from("atividade_sessao").delete().eq("user_id", userId) as any },
        { label: "workout_sessions", promise: supabaseAdmin.from("workout_sessions").delete().eq("user_id", userId) as any },
        { label: "workout_history", promise: supabaseAdmin.from("workout_history").delete().eq("user_id", userId) as any },
        { label: "telemedicina_agendamentos", promise: supabaseAdmin.from("telemedicina_agendamentos").delete().eq("aluno_id", userId) as any },
        { label: "club_post_comments", promise: supabaseAdmin.from("club_post_comments").delete().eq("user_id", userId) as any },
        { label: "club_post_likes", promise: supabaseAdmin.from("club_post_likes").delete().eq("user_id", userId) as any },
        { label: "club_posts", promise: supabaseAdmin.from("club_posts").delete().eq("user_id", userId) as any },
        { label: "running_club_members", promise: supabaseAdmin.from("running_club_members").delete().eq("user_id", userId) as any },
        { label: "running_club_activities", promise: supabaseAdmin.from("running_club_activities").delete().eq("user_id", userId) as any },
        { label: "running_club_challenge_progress", promise: supabaseAdmin.from("running_club_challenge_progress").delete().eq("user_id", userId) as any },
        { label: "store_orders", promise: supabaseAdmin.from("store_orders").delete().eq("user_id", userId) as any },
        { label: "marketplace_orders(buyer)", promise: supabaseAdmin.from("marketplace_orders").delete().eq("user_id", userId) as any },
        { label: "marketplace_coupons", promise: supabaseAdmin.from("marketplace_coupons").delete().eq("user_id", userId) as any },
        { label: "pagamentos", promise: supabaseAdmin.from("pagamentos").delete().eq("user_id", userId) as any },
        { label: "user_notifications", promise: supabaseAdmin.from("user_notifications").delete().eq("user_id", userId) as any },
        { label: "manual_routines", promise: supabaseAdmin.from("manual_routines").delete().eq("user_id", userId) as any },
        { label: "store_users", promise: supabaseAdmin.from("store_users").delete().eq("user_id", userId) as any },
        { label: "marketplace_stores", promise: supabaseAdmin.from("marketplace_stores").delete().eq("owner_user_id", userId) as any },
      ];

      const stepResults = await Promise.allSettled(deleteSteps.map((s) => s.promise));
      const stepErrors: Array<{ label: string; message: string }> = [];

      stepResults.forEach((res, idx) => {
        const label = deleteSteps[idx]?.label ?? `step_${idx}`;
        if (res.status === "rejected") {
          stepErrors.push({ label, message: String(res.reason) });
          return;
        }
        const err = (res.value as any)?.error;
        if (err) {
          stepErrors.push({ label, message: err?.message ?? JSON.stringify(err) });
        }
      });

      // --- 4. Clean up stores owned by this user ---
      if (storeIds.length) {
        // Clear profile FK first
        await supabaseAdmin.from("profiles").update({ store_id: null }).eq("id", userId);
        const { error: storesErr } = await supabaseAdmin.from("stores").delete().in("id", storeIds) as any;
        if (storesErr) stepErrors.push({ label: "stores", message: storesErr.message });
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
      if (profileError) {
        stepErrors.push({ label: "profiles", message: profileError.message });
      }

      const authRes = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authRes.error) {
        return json({
          error: "Database error deleting user",
          details: { auth: authRes.error.message, dependencies: stepErrors },
        }, { status: 400 });
      }

      if (stepErrors.length) {
        return json({ ok: true, warnings: stepErrors });
      }

      return json({ ok: true });
    }

    return json({ error: "Ação não suportada" }, { status: 400 });
  } catch (err) {
    console.error("admin-user-management error:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, { status: 500 });
  }
});
